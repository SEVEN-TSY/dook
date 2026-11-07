import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { AppDatabase } from '../src/main/storage/database'
import { prepareDataDirectory } from '../src/main/storage/data-directory'
import { migrations } from '../src/main/storage/migrations'
import { loadOrCreateToken } from '../src/main/mcp/token'

test('SQLite迁移可重复启动，诊断不留下业务数据', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'dook-storage-'))
  t.after(() => {
    assert.equal(resolve(dirname(directory)), resolve(tmpdir()))
    rmSync(directory, { recursive: true, force: true })
  })
  const path = join(directory, 'app.sqlite')
  const first = new AppDatabase(path)
  try {
    const probe = first.probe()
    assert.equal(probe.roundTrip, true)
    assert.equal(probe.migrationVersion, migrations.at(-1)!.version)
    assert.equal(probe.journalMode, 'wal')
    assert.equal(first.probe().roundTrip, true)
  } finally {
    first.close()
  }
  const second = new AppDatabase(path)
  try {
    assert.equal(second.probe().migrationVersion, migrations.at(-1)!.version)
  } finally {
    second.close()
  }
  const inspect = new DatabaseSync(path, { readOnly: true })
  try {
    assert.equal(
      inspect.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()!.count,
      migrations.length
    )
    const tables = inspect
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
    assert.deepEqual(
      tables.map((row) => row.name),
      [
        'app_metadata',
        'habit_generations',
        'habits',
        'inspiration_additions',
        'inspiration_topic_members',
        'inspiration_topics',
        'inspirations',
        'schema_migrations',
        'sqlite_sequence',
        'task_subitems',
        'tasks'
      ]
    )
  } finally {
    inspect.close()
  }
})

test('MCP凭证持久化且不会在重启时覆盖', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'dook-token-'))
  t.after(() => {
    assert.equal(resolve(dirname(directory)), resolve(tmpdir()))
    rmSync(directory, { recursive: true, force: true })
  })
  const path = join(directory, 'mcp-token')
  const first = loadOrCreateToken(path)
  assert.match(first, /^[a-f0-9]{64}$/)
  assert.equal(loadOrCreateToken(path), first)
  assert.equal(readFileSync(path, 'utf8'), first)
})

test('DOOK首次启动导入旧数据库的WAL、窗口设置和MCP凭证，重启使用新数据', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'dook-upgrade-'))
  const previousDirectory = join(directory, 'previous')
  const currentDirectory = join(directory, 'dook')
  const oldDatabase = new AppDatabase(join(previousDirectory, 'mytodo.sqlite'))
  t.after(() => {
    oldDatabase.close()
    rmSync(directory, { recursive: true, force: true })
  })
  oldDatabase.connection.exec(`
    DELETE FROM schema_migrations WHERE version = 20;
    UPDATE app_metadata SET value = 'mytodo' WHERE key = 'schema';
    PRAGMA wal_checkpoint(TRUNCATE);
    INSERT INTO app_metadata VALUES ('wal-only', 'preserved');
  `)
  const preferences = '{"settings":{"appearance":"dark"}}'
  writeFileSync(join(previousDirectory, 'desktop-settings.json'), preferences)
  const token = loadOrCreateToken(join(previousDirectory, 'mcp-token'))

  const newPath = await prepareDataDirectory(currentDirectory, previousDirectory)
  assert.equal(newPath, join(currentDirectory, 'dook.sqlite'))
  assert.equal(readFileSync(join(currentDirectory, 'desktop-settings.json'), 'utf8'), preferences)
  assert.equal(loadOrCreateToken(join(currentDirectory, 'mcp-token')), token)
  const newDatabase = new AppDatabase(newPath)
  try {
    const metadata = newDatabase.connection.prepare('SELECT value FROM app_metadata WHERE key = ?')
    assert.equal(metadata.get('schema')?.value, 'dook')
    assert.equal(metadata.get('wal-only')?.value, 'preserved')
    newDatabase.connection.exec("UPDATE app_metadata SET value = 'updated' WHERE key = 'wal-only'")
    assert.equal(await prepareDataDirectory(currentDirectory, previousDirectory), newPath)
    assert.equal(metadata.get('wal-only')?.value, 'updated')
    const previousMetadata = oldDatabase.connection.prepare(
      'SELECT value FROM app_metadata WHERE key = ?'
    )
    assert.equal(previousMetadata.get('schema')?.value, 'mytodo')
  } finally {
    newDatabase.close()
  }
})

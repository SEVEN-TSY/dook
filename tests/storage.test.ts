import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { AppDatabase } from '../src/main/storage/database'
import { loadOrCreateToken } from '../src/main/mcp/token'

test('SQLite迁移可重复启动，诊断不留下业务数据', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'mytodo-storage-'))
  t.after(() => {
    assert.equal(resolve(dirname(directory)), resolve(tmpdir()))
    rmSync(directory, { recursive: true, force: true })
  })
  const path = join(directory, 'app.sqlite')
  const first = new AppDatabase(path)
  try {
    const probe = first.probe()
    assert.equal(probe.roundTrip, true)
    assert.equal(probe.migrationVersion, 3)
    assert.equal(probe.journalMode, 'wal')
    assert.equal(first.probe().roundTrip, true)
  } finally {
    first.close()
  }
  const second = new AppDatabase(path)
  try {
    assert.equal(second.probe().migrationVersion, 3)
  } finally {
    second.close()
  }
  const inspect = new DatabaseSync(path, { readOnly: true })
  try {
    assert.equal(inspect.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()!.count, 3)
    const tables = inspect
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
    assert.deepEqual(
      tables.map((row) => row.name),
      ['app_metadata', 'schema_migrations', 'sqlite_sequence', 'tasks']
    )
  } finally {
    inspect.close()
  }
})

test('MCP凭证持久化且不会在重启时覆盖', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'mytodo-token-'))
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

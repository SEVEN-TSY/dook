import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import type { StorageProbe } from '../../shared/contracts'
import { migrations } from './migrations'

/** 由主进程创建并独占生命周期，后续仓储通过构造参数接收此连接。 */
export class AppDatabase {
  readonly connection: DatabaseSync

  constructor(readonly path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.connection = new DatabaseSync(path)
    try {
      this.connection.exec(
        'PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000; PRAGMA journal_mode = WAL;'
      )
      this.migrate()
    } catch (error) {
      this.connection.close()
      throw error
    }
  }

  private migrate(): void {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT;
    `)
    const current = this.connection
      .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
      .get()!
    if (Number(current.version) > migrations.at(-1)!.version) {
      throw new Error('数据库版本高于当前应用，请使用更新的应用版本。')
    }
    this.connection.exec('BEGIN IMMEDIATE')
    try {
      for (const migration of migrations) {
        if (migration.version <= Number(current.version)) continue
        this.connection.exec(migration.sql)
        this.connection
          .prepare('INSERT INTO schema_migrations VALUES (?, ?, ?)')
          .run(migration.version, migration.name, new Date().toISOString())
      }
      this.connection.exec('COMMIT')
    } catch (error) {
      this.connection.exec('ROLLBACK')
      throw error
    }
  }

  /** 临时表验证真实写入和读取，不向业务库添加测试事项。 */
  probe(): StorageProbe {
    this.connection.exec(
      'CREATE TEMP TABLE IF NOT EXISTS diagnostic_probe (id TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT'
    )
    const id = randomUUID()
    this.connection.exec('BEGIN IMMEDIATE')
    try {
      this.connection.prepare('INSERT INTO diagnostic_probe VALUES (?, ?)').run(id, 'hello-sqlite')
      const row = this.connection.prepare('SELECT value FROM diagnostic_probe WHERE id = ?').get(id)
      const version = this.connection.prepare('SELECT sqlite_version() AS version').get()!
      const migration = this.connection
        .prepare('SELECT MAX(version) AS version FROM schema_migrations')
        .get()!
      const journal = this.connection.prepare('PRAGMA journal_mode').get()!
      return {
        sqliteVersion: String(version.version),
        migrationVersion: Number(migration.version),
        journalMode: String(journal.journal_mode),
        roundTrip: row?.value === 'hello-sqlite'
      }
    } finally {
      this.connection.exec('ROLLBACK')
    }
  }

  close(): void {
    this.connection.close()
  }
}

import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { AppDatabase } from '../src/main/storage/database'
import { TaskRepository } from '../src/main/storage/repositories/tasks'
import { AppService } from '../src/main/core/app-service'

test('今天任务转换为多天任务后保留标识并在今天任务之后稳定展示', () => {
  const database = new AppDatabase(':memory:')
  const service = new AppService(database, new TaskRepository(database.connection))
  try {
    const first = service.createTask('整理需求')
    const second = service.createTask('检查构建')
    const converted = service.convertToMultiDay(first.id)
    assert.equal(converted.id, first.id)
    assert.equal(converted.description, '整理需求')
    assert.equal(converted.kind, 'multi-day')
    assert.equal(converted.progress, 0)
    assert.equal(converted.completed, false)
    assert.deepEqual(
      service.listToday().tasks.map((task) => task.id),
      [second.id, first.id]
    )
  } finally {
    database.close()
  }
})

test('已有SQLite任务升级后保持内容、日期与顺序，多天进度重启恢复', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'mytodo-multiday-'))
  t.after(() => {
    assert.equal(resolve(dirname(directory)), resolve(tmpdir()))
    rmSync(directory, { recursive: true, force: true })
  })
  const path = join(directory, 'tasks.sqlite')
  const legacy = new DatabaseSync(path)
  legacy.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT;
    INSERT INTO schema_migrations VALUES (1, 'infrastructure_metadata', '2026-10-27'), (2, 'today_tasks', '2026-10-27');
    CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    CREATE TABLE tasks (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL CHECK(length(trim(description)) > 0), date TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1))
    ) STRICT;
    CREATE INDEX tasks_date_sequence ON tasks(date, sequence);
    INSERT INTO tasks (id, description, date, completed) VALUES
      ('old', '昨天的今天任务', '2026-10-26', 0),
      ('first', '已完成的需求', '2026-10-27', 1),
      ('second', '待推进的需求', '2026-10-27', 0);
  `)
  legacy.close()
  let database = new AppDatabase(path)
  let now = new Date(2026, 9, 27, 12)
  let service = new AppService(database, new TaskRepository(database.connection), () => now)
  try {
    assert.deepEqual(
      service
        .listToday()
        .tasks.map(({ id, description, date, completed, kind }) => ({
          id,
          description,
          date,
          completed,
          kind
        })),
      [
        {
          id: 'first',
          description: '已完成的需求',
          date: '2026-10-27',
          completed: true,
          kind: 'today'
        },
        {
          id: 'second',
          description: '待推进的需求',
          date: '2026-10-27',
          completed: false,
          kind: 'today'
        }
      ]
    )
    service.convertToMultiDay('first')
    service.convertToMultiDay('second')
    service.setTaskProgress('second', 45)
    database.close()
    now = new Date(2026, 9, 28, 12)
    database = new AppDatabase(path)
    service = new AppService(database, new TaskRepository(database.connection), () => now)
    assert.deepEqual(
      service.listToday().tasks.map(({ id, progress }) => ({ id, progress })),
      [{ id: 'second', progress: 45 }]
    )
    service.deleteTask('second')
    assert.deepEqual(service.listToday().tasks, [])
  } finally {
    database.close()
  }
})

test('多天任务勾选与取消同步进度，进度非法输入不修改任务', () => {
  const database = new AppDatabase(':memory:')
  const service = new AppService(database, new TaskRepository(database.connection))
  try {
    const task = service.createTask('整理需求')
    assert.throws(() => service.setTaskProgress(task.id, 30), /今天任务/)
    service.setTaskCompleted(task.id, true)
    const converted = service.convertToMultiDay(task.id)
    assert.equal(converted.progress, 100)
    assert.equal(converted.completed, true)
    assert.equal(service.setTaskCompleted(task.id, false).progress, 0)
    assert.equal(service.setTaskCompleted(task.id, true).progress, 100)
    assert.equal(service.setTaskProgress(task.id, 60).completed, false)
    for (const invalid of [-1, 101, 1.5, NaN]) {
      assert.throws(() => service.setTaskProgress(task.id, invalid), /进度/)
    }
    assert.equal(service.listToday().tasks[0]?.progress, 60)
    service.deleteTask(task.id)
    assert.throws(() => service.setTaskProgress(task.id, 30), /不存在/)
  } finally {
    database.close()
  }
})

test('多天任务跨日继续推进，完成当天保留且次日隐藏', () => {
  const database = new AppDatabase(':memory:')
  let now = new Date(2026, 9, 27, 23, 59)
  const service = new AppService(database, new TaskRepository(database.connection), () => now)
  try {
    const task = service.createTask('整理需求')
    service.convertToMultiDay(task.id)
    service.setTaskProgress(task.id, 40)
    now = new Date(2026, 9, 28, 0, 1)
    assert.equal(service.listToday().tasks[0]?.progress, 40)
    service.updateTask(task.id, '整理完整需求')
    const finished = service.setTaskProgress(task.id, 100)
    assert.equal(finished.completed, true)
    assert.equal(finished.completedOn, '2026-10-28')
    assert.equal(service.listToday().tasks[0]?.id, task.id)
    now = new Date(2026, 9, 29, 0, 1)
    assert.deepEqual(service.listToday().tasks, [])
    assert.throws(() => service.updateTask(task.id, '过时输入'), /不存在/)
  } finally {
    database.close()
  }
})

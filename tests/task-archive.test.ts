import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/storage/database'
import { TaskRepository } from '../src/main/storage/repositories/tasks'
import { AppService } from '../src/main/core/app-service'
import { HabitRepository } from '../src/main/storage/repositories/habits'
import { DatabaseSync } from 'node:sqlite'
import { migrations } from '../src/main/storage/migrations'

test('今天任务归档后只读且跨日重启保留，恢复到当天并保留状态', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mytodo-archive-'))
  const path = join(directory, 'tasks.sqlite')
  let database = new AppDatabase(path)
  let now = new Date(2026, 10, 1, 12)
  const open = () =>
    new AppService(database, new TaskRepository(database.connection), () => now, {
      habits: new HabitRepository(database.connection)
    })
  let service = open()
  try {
    const task = service.createTask('检查构建')
    service.setTaskPinned(task.id, true)
    const saved = service.setTaskCompleted(task.id, true)
    service.archiveTask(task.id)
    assert.deepEqual(service.listToday().tasks, [])
    assert.deepEqual(service.listArchivedTasks(), [saved])
    assert.throws(() => service.updateTask(task.id, '迟到保存'), /不存在/)
    assert.throws(() => service.setTaskCompleted(task.id, false), /不存在/)
    assert.throws(() => service.setTaskPinned(task.id, false), /不存在/)
    assert.throws(() => service.addSubitem(task.id, '迟到子事项'), /不存在/)
    assert.throws(() => service.deleteTask(task.id), /不存在/)
    assert.throws(() => service.createHabitFromTask(task.id), /不存在/)
    database.close()
    now = new Date(2026, 10, 2, 12)
    database = new AppDatabase(path)
    service = open()
    assert.deepEqual(service.listArchivedTasks(), [saved])
    const restored = service.restoreTask(task.id)
    assert.deepEqual(restored, { ...saved, date: '2026-11-02' })
    assert.deepEqual(service.listToday().tasks, [restored])
    assert.deepEqual(service.listArchivedTasks(), [])
  } finally {
    database.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('多天任务恢复保留子事项与进度，永久删除只接受归档任务', () => {
  const database = new AppDatabase(':memory:')
  let now = new Date(2026, 10, 1, 12)
  const service = new AppService(database, new TaskRepository(database.connection), () => now)
  try {
    const task = service.createTask('发布版本')
    service.addSubitem(task.id, '构建')
    service.addSubitem(task.id, '发布')
    service.setTaskPinned(task.id, true)
    const saved = service.setTaskCompleted(task.id, true)
    assert.throws(() => service.deleteArchivedTask(task.id), /不存在/)
    service.archiveTask(task.id)
    const subitem = saved.subitems![0]!
    assert.throws(() => service.updateSubitem(task.id, subitem.id, '迟到编辑'), /不存在/)
    assert.throws(() => service.setTaskProgress(task.id, 20), /不存在/)
    now = new Date(2026, 10, 3, 12)
    assert.deepEqual(service.restoreTask(task.id), { ...saved, completedOn: '2026-11-03' })
    service.setTaskCompleted(task.id, false)
    service.archiveTask(task.id)
    const other = service.createTask('其他任务')
    service.archiveTask(other.id)
    assert.deepEqual(
      service.listArchivedTasks().map((item) => item.id),
      [other.id, task.id]
    )
    database.connection.exec(
      "CREATE TRIGGER block_subitem_delete BEFORE DELETE ON task_subitems BEGIN SELECT RAISE(ABORT, 'subitem unavailable'); END"
    )
    assert.throws(() => service.deleteArchivedTask(task.id), /subitem unavailable/)
    assert.deepEqual(
      service.listArchivedTasks().find((item) => item.id === task.id)?.subitems,
      saved.subitems!.map((item) => ({ ...item, completed: false }))
    )
    database.connection.exec('DROP TRIGGER block_subitem_delete')
    service.deleteArchivedTask(task.id)
    assert.deepEqual(
      service.listArchivedTasks().map((item) => item.id),
      [other.id]
    )
    assert.throws(() => service.restoreTask(task.id), /不存在/)
    const fresh = service.createTask('新任务')
    assert.equal(service.addSubitem(fresh.id, '新子事项').subitems!.length, 1)
  } finally {
    database.close()
  }
})

test('习惯任务继续暂停一次，归档不可改变习惯生成规则', () => {
  const database = new AppDatabase(':memory:')
  let now = new Date(2026, 10, 1, 12)
  const service = new AppService(database, new TaskRepository(database.connection), () => now, {
    habits: new HabitRepository(database.connection)
  })
  try {
    const habit = service.setHabitSchedule(service.createHabit('检查构建').id, {
      kind: 'daily',
      time: '00:00'
    })
    const task = service.listToday().tasks[0]!
    assert.throws(() => service.archiveTask(task.id), /暂停一次/)
    service.skipHabitTask(task.id)
    service.ensureDailyTasks()
    assert.deepEqual(service.listToday().tasks, [])
    assert.deepEqual(service.listArchivedTasks(), [])
    now = new Date(2026, 10, 2, 12)
    service.ensureDailyTasks()
    assert.equal(service.listToday().tasks[0]!.habitId, habit.id)
  } finally {
    database.close()
  }
})

test('升级旧数据库后既有任务保持未归档且可归档恢复', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mytodo-archive-migration-'))
  const path = join(directory, 'tasks.sqlite')
  const legacy = new DatabaseSync(path)
  try {
    legacy.exec(
      'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT'
    )
    for (const migration of migrations.filter((item) => item.version <= 11)) {
      legacy.exec(migration.sql)
      legacy
        .prepare('INSERT INTO schema_migrations VALUES (?, ?, ?)')
        .run(migration.version, migration.name, '2026-11-01T00:00:00Z')
    }
    legacy
      .prepare('INSERT INTO tasks (id, description, date, completed) VALUES (?, ?, ?, ?)')
      .run('legacy-task', '旧任务', '2026-11-01', 1)
  } finally {
    legacy.close()
  }
  const database = new AppDatabase(path)
  try {
    const service = new AppService(
      database,
      new TaskRepository(database.connection),
      () => new Date(2026, 10, 1, 12)
    )
    const task = service.listToday().tasks[0]!
    assert.equal(task.description, '旧任务')
    assert.equal(task.completed, true)
    assert.deepEqual(service.listArchivedTasks(), [])
    service.archiveTask(task.id)
    assert.deepEqual(service.listArchivedTasks(), [task])
    assert.deepEqual(service.restoreTask(task.id), task)
  } finally {
    database.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

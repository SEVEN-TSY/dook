import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { AppDatabase } from '../src/main/storage/database'
import { AppService } from '../src/main/core/app-service'
import { TaskRepository } from '../src/main/storage/repositories/tasks'
import { HabitRepository } from '../src/main/storage/repositories/habits'

test('创建习惯当天立即生成今天任务并标明来源', () => {
  const database = new AppDatabase(':memory:')
  const service = new AppService(
    database,
    new TaskRepository(database.connection),
    () => new Date(2026, 9, 27, 12),
    { habits: new HabitRepository(database.connection) }
  )
  try {
    assert.throws(() => service.createHabit('  '), /习惯描述/)
    const habit = service.createHabit('  检查构建状态  ')
    assert.equal(habit.description, '检查构建状态')
    assert.deepEqual(service.listHabits(), [habit])
    const tasks = service.listToday().tasks
    assert.equal(tasks.length, 1)
    assert.equal(tasks[0]?.description, '检查构建状态')
    assert.equal(tasks[0]?.date, '2026-10-27')
    assert.equal(tasks[0]?.completed, false)
    assert.equal(tasks[0]?.habitId, habit.id)
  } finally {
    database.close()
  }
})

test('习惯每天仅生成一次，完成删除和多次补齐均不重复生成', () => {
  const database = new AppDatabase(':memory:')
  let now = new Date(2026, 9, 27, 23, 59)
  const service = new AppService(database, new TaskRepository(database.connection), () => now, {
    habits: new HabitRepository(database.connection)
  })
  try {
    const first = service.createHabit('检查构建')
    service.createHabit('整理待办')
    const tasks = service.listToday().tasks
    service.setTaskCompleted(tasks[0]!.id, true)
    service.deleteTask(tasks[1]!.id)
    assert.equal(service.ensureDailyTasks(), false)
    assert.equal(service.ensureDailyTasks(), false)
    assert.equal(service.listToday().tasks.length, 1)
    assert.equal(service.listToday().tasks[0]!.completed, true)
    assert.equal(service.listToday().tasks[0]!.habitId, first.id)
    now = new Date(2026, 9, 28, 0, 0)
    assert.equal(service.ensureDailyTasks(), true)
    assert.equal(service.ensureDailyTasks(), false)
    assert.deepEqual(
      service.listToday().tasks.map((task) => [task.description, task.date, task.completed]),
      [
        ['检查构建', '2026-10-28', false],
        ['整理待办', '2026-10-28', false]
      ]
    )
  } finally {
    database.close()
  }
})

test('习惯生成记录重启后保留且只补当天，不补过去日期', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mytodo-habits-'))
  const path = join(directory, 'habits.sqlite')
  let database = new AppDatabase(path)
  let now = new Date(2026, 9, 27, 10)
  const service = () =>
    new AppService(database, new TaskRepository(database.connection), () => now, {
      habits: new HabitRepository(database.connection)
    })
  try {
    const habit = service().createHabit('每日整理')
    service().deleteTask(service().listToday().tasks[0]!.id)
    database.close()
    database = new AppDatabase(path)
    assert.deepEqual(service().listHabits(), [habit])
    assert.equal(service().ensureDailyTasks(), false)
    assert.deepEqual(service().listToday().tasks, [])
    now = new Date(2026, 9, 30, 10)
    assert.equal(service().ensureDailyTasks(), true)
    const task = service().listToday().tasks[0]!
    assert.equal(task.date, '2026-10-30')
    assert.equal(task.habitId, habit.id)
    database.close()
    database = new AppDatabase(path)
    assert.equal(service().ensureDailyTasks(), false)
    assert.equal(service().listToday().tasks[0]!.id, task.id)
    now = new Date(2026, 9, 28, 10)
    assert.deepEqual(service().listToday().tasks, [])
    now = new Date(2026, 9, 29, 10)
    assert.deepEqual(service().listToday().tasks, [])
  } finally {
    database.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('习惯创建失败不留下半条结果，解除数据库写锁后可重试', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mytodo-habits-lock-'))
  const path = join(directory, 'habits.sqlite')
  const database = new AppDatabase(path)
  const lock = new DatabaseSync(path)
  database.connection.exec('PRAGMA busy_timeout = 0')
  const service = new AppService(
    database,
    new TaskRepository(database.connection),
    () => new Date(2026, 9, 27, 10),
    { habits: new HabitRepository(database.connection) }
  )
  try {
    lock.exec('BEGIN IMMEDIATE')
    assert.throws(() => service.createHabit('每日检查'), /locked/)
    assert.deepEqual(service.listHabits(), [])
    assert.deepEqual(service.listToday().tasks, [])
    lock.exec('ROLLBACK')
    service.createHabit('每日检查')
    assert.equal(service.listHabits().length, 1)
    assert.equal(service.listToday().tasks.length, 1)
    assert.equal(service.ensureDailyTasks(), false)
  } finally {
    lock.close()
    database.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

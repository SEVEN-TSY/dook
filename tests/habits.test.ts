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
    const second = service.createHabit('整理待办')
    service.setHabitSchedule(first.id, { kind: 'daily', time: '00:00' })
    service.setHabitSchedule(second.id, { kind: 'daily', time: '00:00' })
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

test('习惯任务不允许直接编辑描述或转换为多天任务，仍可完成和置顶', () => {
  const database = new AppDatabase(':memory:')
  const service = new AppService(database, new TaskRepository(database.connection), undefined, {
    habits: new HabitRepository(database.connection)
  })
  try {
    service.createHabit('检查构建')
    const task = service.listToday().tasks[0]
    assert.throws(() => service.updateTask(task.id, '修改'), /习惯中修改描述/)
    assert.throws(() => service.convertToMultiDay(task.id), /不能转为多天任务/)
    assert.throws(() => service.addSubitem(task.id, '子事项'), /不能转为多天任务/)
    assert.deepEqual(service.listToday().tasks, [task])
    assert.equal(service.setTaskCompleted(task.id, true).completed, true)
    assert.equal(service.setTaskPinned(task.id, true).pinned, true)
  } finally {
    database.close()
  }
})

test('暂停一次保留习惯和任务记录，当天重启不重建，次日继续生成', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mytodo-skip-habit-'))
  const path = join(directory, 'tasks.sqlite')
  let database = new AppDatabase(path)
  let now = new Date(2026, 9, 28, 12)
  const open = () =>
    new AppService(database, new TaskRepository(database.connection), () => now, {
      habits: new HabitRepository(database.connection)
    })
  let service = open()
  try {
    const habit = service.createHabit('检查构建')
    const task = service.listToday().tasks[0]
    const ordinary = service.createTask('普通任务')
    assert.throws(() => service.skipHabitTask(ordinary.id), /只能暂停今天的习惯任务/)
    service.skipHabitTask(task.id)
    assert.deepEqual(service.listToday().tasks, [ordinary])
    assert.deepEqual(service.listHabits(), [habit])
    assert.equal(
      database.connection.prepare('SELECT skipped_on FROM tasks WHERE id = ?').get(task.id)
        ?.skipped_on,
      '2026-10-28'
    )
    database.close()
    database = new AppDatabase(path)
    service = open()
    service.ensureDailyTasks()
    assert.deepEqual(service.listToday().tasks, [ordinary])
    now = new Date(2026, 9, 29, 12)
    service.ensureDailyTasks()
    const next = service.listToday().tasks
    assert.equal(next.length, 1)
    assert.equal(next[0].habitId, habit.id)
    assert.notEqual(next[0].id, task.id)
  } finally {
    database.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

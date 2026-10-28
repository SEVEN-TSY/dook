import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { AppDatabase } from '../src/main/storage/database'
import { AppService } from '../src/main/core/app-service'
import { TaskRepository } from '../src/main/storage/repositories/tasks'
import { HabitRepository } from '../src/main/storage/repositories/habits'

test('从今天任务添加习惯复用原任务且重复操作不生成新任务', () => {
  const database = new AppDatabase(':memory:')
  const service = new AppService(
    database,
    new TaskRepository(database.connection),
    () => new Date(2026, 9, 27, 12),
    { habits: new HabitRepository(database.connection) }
  )
  try {
    const task = service.createTask('检查构建')
    service.setTaskCompleted(task.id, true)
    const habit = service.createHabitFromTask(task.id)
    assert.deepEqual(service.listHabits(), [habit])
    assert.deepEqual(service.listToday().tasks, [{ ...task, completed: true, habitId: habit.id }])
    assert.deepEqual(service.createHabitFromTask(task.id), habit)
    assert.equal(service.ensureDailyTasks(), false)
    assert.equal(service.listToday().tasks.length, 1)
    service.deleteTask(task.id)
    assert.equal(service.ensureDailyTasks(), false)
    assert.deepEqual(service.listToday().tasks, [])
  } finally {
    database.close()
  }
})

test('习惯编辑删除只改变后续生成且保留已有任务与来源', () => {
  const database = new AppDatabase(':memory:')
  let now = new Date(2026, 9, 27, 12)
  const service = new AppService(database, new TaskRepository(database.connection), () => now, {
    habits: new HabitRepository(database.connection)
  })
  try {
    const habit = service.createHabit('检查构建')
    const original = service.listToday().tasks[0]!
    assert.throws(() => service.updateHabit(habit.id, '  '), /习惯描述/)
    const updated = service.updateHabit(habit.id, '  更新进展  ')
    assert.deepEqual(updated, { id: habit.id, description: '更新进展' })
    assert.deepEqual(service.listToday().tasks, [original])
    now = new Date(2026, 9, 28, 12)
    service.ensureDailyTasks()
    const next = service.listToday().tasks[0]!
    assert.equal(next.description, '更新进展')
    assert.equal(next.habitId, habit.id)
    service.deleteHabit(habit.id)
    assert.deepEqual(service.listHabits(), [])
    assert.deepEqual(service.listToday().tasks, [next])
    assert.throws(() => service.updateHabit(habit.id, '不能恢复'), /习惯不存在/)
    now = new Date(2026, 9, 29, 12)
    assert.equal(service.ensureDailyTasks(), false)
    assert.deepEqual(service.listToday().tasks, [])
    now = new Date(2026, 9, 27, 12)
    assert.deepEqual(service.listToday().tasks, [original])
  } finally {
    database.close()
  }
})

test('从任务添加习惯失败整体回滚，重试后关联正确且拒绝非今天任务', () => {
  const database = new AppDatabase(':memory:')
  let now = new Date(2026, 9, 27, 12)
  const service = new AppService(database, new TaskRepository(database.connection), () => now, {
    habits: new HabitRepository(database.connection)
  })
  try {
    const task = service.createTask('整理待办')
    database.connection.exec(
      "CREATE TRIGGER fail_habit_record BEFORE INSERT ON habit_generations BEGIN SELECT RAISE(ABORT, 'generation unavailable'); END"
    )
    assert.throws(() => service.createHabitFromTask(task.id), /generation unavailable/)
    assert.deepEqual(service.listHabits(), [])
    assert.deepEqual(service.listToday().tasks, [task])
    database.connection.exec('DROP TRIGGER fail_habit_record')
    const habit = service.createHabitFromTask(task.id)
    assert.equal(service.ensureDailyTasks(), false)
    assert.equal(service.listToday().tasks.length, 1)
    const multi = service.createTask('跨日工作')
    service.convertToMultiDay(multi.id)
    assert.throws(() => service.createHabitFromTask(multi.id), /今天任务不存在/)
    now = new Date(2026, 9, 28, 12)
    assert.throws(() => service.createHabitFromTask(task.id), /今天任务不存在/)
    service.ensureDailyTasks()
    assert.equal(service.listToday().tasks.filter((item) => item.habitId === habit.id).length, 1)
  } finally {
    database.close()
  }
})

test('任务复用关系及删除习惯后的历史来源重启保留', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mytodo-habit-maintenance-'))
  const path = join(directory, 'habits.sqlite')
  let database = new AppDatabase(path)
  let now = new Date(2026, 9, 27, 12)
  const service = () =>
    new AppService(database, new TaskRepository(database.connection), () => now, {
      habits: new HabitRepository(database.connection)
    })
  try {
    const task = service().createTask('每日发布检查')
    const habit = service().createHabitFromTask(task.id)
    database.close()
    database = new AppDatabase(path)
    assert.equal(service().ensureDailyTasks(), false)
    assert.deepEqual(service().createHabitFromTask(task.id), habit)
    assert.equal(service().listToday().tasks.length, 1)
    service().deleteHabit(habit.id)
    database.close()
    database = new AppDatabase(path)
    assert.deepEqual(service().listHabits(), [])
    assert.deepEqual(service().listToday().tasks, [{ ...task, habitId: habit.id }])
    assert.throws(() => service().createHabitFromTask(task.id), /已关联过习惯/)
    now = new Date(2026, 9, 28, 12)
    assert.equal(service().ensureDailyTasks(), false)
    assert.deepEqual(service().listToday().tasks, [])
  } finally {
    database.close()
    assert.equal(resolve(dirname(directory)), resolve(tmpdir()))
    rmSync(directory, { recursive: true, force: true })
  }
})

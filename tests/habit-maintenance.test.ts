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

test('编辑习惯同步当天描述，删除习惯只删除当天任务并保留历史任务与来源', () => {
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
    assert.deepEqual(service.listToday().tasks, [{ ...original, description: '更新进展' }])
    now = new Date(2026, 9, 28, 12)
    service.ensureDailyTasks()
    const next = service.listToday().tasks[0]!
    assert.equal(next.description, '更新进展')
    assert.equal(next.habitId, habit.id)
    service.deleteHabit(habit.id)
    assert.deepEqual(service.listHabits(), [])
    assert.deepEqual(service.listToday().tasks, [])
    assert.equal(
      database.connection.prepare('SELECT id FROM tasks WHERE id = ?').get(next.id),
      undefined
    )
    assert.throws(() => service.updateHabit(habit.id, '不能恢复'), /习惯不存在/)
    now = new Date(2026, 9, 29, 12)
    assert.equal(service.ensureDailyTasks(), false)
    assert.deepEqual(service.listToday().tasks, [])
    now = new Date(2026, 9, 27, 12)
    assert.deepEqual(service.listToday().tasks, [{ ...original, description: '更新进展' }])
  } finally {
    database.close()
  }
})

test('删除习惯清理当天已完成或已暂停任务，不影响其他任务，失败整体回滚', () => {
  const database = new AppDatabase(':memory:')
  const service = new AppService(
    database,
    new TaskRepository(database.connection),
    () => new Date(2026, 9, 28, 12),
    {
      habits: new HabitRepository(database.connection)
    }
  )
  try {
    const habit = service.createHabit('每日检查')
    const task = service.listToday().tasks[0]!
    const other = service.createHabit('每日检查')
    const ordinary = service.createTask('每日检查')
    service.setTaskCompleted(task.id, true)
    service.skipHabitTask(task.id)
    database.connection.exec(
      "CREATE TRIGGER fail_habit_delete BEFORE DELETE ON tasks BEGIN SELECT RAISE(ABORT, 'delete failed'); END"
    )
    assert.throws(() => service.deleteHabit(habit.id), /delete failed/)
    assert.equal(
      service.listHabits().some((item) => item.id === habit.id),
      true
    )
    assert.ok(database.connection.prepare('SELECT id FROM tasks WHERE id = ?').get(task.id))
    database.connection.exec('DROP TRIGGER fail_habit_delete')
    service.deleteHabit(habit.id)
    assert.equal(
      database.connection.prepare('SELECT id FROM tasks WHERE id = ?').get(task.id),
      undefined
    )
    assert.deepEqual(service.listHabits(), [other])
    assert.equal(service.listToday().tasks.length, 2)
    assert.ok(service.listToday().tasks.some((item) => item.id === ordinary.id))
    assert.equal(service.ensureDailyTasks(), false)
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

test('任务复用关系及删除习惯后的当天任务清理重启保留', () => {
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
    assert.deepEqual(service().listToday().tasks, [])
    assert.throws(() => service().createHabitFromTask(task.id), /今天任务不存在/)
    now = new Date(2026, 9, 28, 12)
    assert.equal(service().ensureDailyTasks(), false)
    assert.deepEqual(service().listToday().tasks, [])
  } finally {
    database.close()
    assert.equal(resolve(dirname(directory)), resolve(tmpdir()))
    rmSync(directory, { recursive: true, force: true })
  }
})

test('习惯描述同步只更新当天并保留完成置顶暂停状态，失败时整体回滚', () => {
  const database = new AppDatabase(':memory:')
  let now = new Date(2026, 9, 27, 12)
  const service = new AppService(database, new TaskRepository(database.connection), () => now, {
    habits: new HabitRepository(database.connection)
  })
  try {
    const habit = service.createHabit('原描述')
    const yesterday = service.listToday().tasks[0]
    now = new Date(2026, 9, 28, 12)
    service.ensureDailyTasks()
    const today = service.listToday().tasks[0]
    service.setTaskCompleted(today.id, true)
    service.setTaskPinned(today.id, true)
    service.updateHabit(habit.id, '当天新描述')
    assert.deepEqual(service.listToday().tasks, [
      { ...today, description: '当天新描述', completed: true, pinned: true }
    ])
    assert.equal(
      database.connection.prepare('SELECT description FROM tasks WHERE id = ?').get(yesterday.id)
        ?.description,
      '原描述'
    )
    service.skipHabitTask(today.id)
    service.updateHabit(habit.id, '暂停后新描述')
    assert.equal(service.ensureDailyTasks(), false)
    assert.deepEqual(service.listToday().tasks, [])
    const paused = database.connection
      .prepare('SELECT description, completed, pinned, skipped_on FROM tasks WHERE id = ?')
      .get(today.id)!
    assert.equal(paused.description, '暂停后新描述')
    assert.equal(paused.completed, 1)
    assert.equal(paused.pinned, 1)
    assert.equal(paused.skipped_on, '2026-10-28')
    database.connection.exec(
      "CREATE TRIGGER fail_habit_sync BEFORE UPDATE OF description ON tasks BEGIN SELECT RAISE(ABORT, 'sync failed'); END"
    )
    assert.throws(() => service.updateHabit(habit.id, '失败的编辑'), /sync failed/)
    assert.equal(service.listHabits()[0].description, '暂停后新描述')
    database.connection.exec('DROP TRIGGER fail_habit_sync')
  } finally {
    database.close()
  }
})

test('习惯归档停止生成，恢复补齐当天且永久删除保留历史，状态重启保留', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mytodo-habit-archive-'))
  const path = join(directory, 'habits.sqlite')
  let database = new AppDatabase(path)
  let now = new Date(2026, 10, 1, 12)
  const service = () =>
    new AppService(database, new TaskRepository(database.connection), () => now, {
      habits: new HabitRepository(database.connection)
    })
  try {
    const habit = service().createHabit('每日归档测试')
    const historical = service().listToday().tasks[0]
    now = new Date(2026, 10, 2, 12)
    service().ensureDailyTasks()
    service().archiveHabit(habit.id)
    assert.deepEqual(service().listHabits(), [])
    assert.deepEqual(service().listArchivedHabits(), [habit])
    assert.deepEqual(service().listToday().tasks, [])
    assert.throws(() => service().updateHabit(habit.id, '禁止编辑'), /习惯不存在/)
    assert.throws(() => service().deleteHabit(habit.id), /习惯不存在/)
    database.close()
    database = new AppDatabase(path)
    assert.deepEqual(service().listArchivedHabits(), [habit])
    now = new Date(2026, 10, 3, 12)
    assert.equal(service().ensureDailyTasks(), false)
    service().restoreHabit(habit.id)
    assert.equal(service().listToday().tasks.length, 1)
    assert.equal(service().listToday().tasks[0].habitId, habit.id)
    assert.equal(service().ensureDailyTasks(), false)
    assert.throws(() => service().restoreHabit(habit.id), /归档习惯不存在/)
    assert.throws(() => service().deleteArchivedHabit(habit.id), /归档习惯不存在/)
    now = new Date(2026, 10, 4, 12)
    assert.equal(service().ensureDailyTasks(), true)
    service().archiveHabit(habit.id)
    service().restoreHabit(habit.id)
    assert.equal(service().listToday().tasks.length, 1)
    service().archiveHabit(habit.id)
    service().deleteArchivedHabit(habit.id)
    assert.deepEqual(service().listArchivedHabits(), [])
    assert.ok(database.connection.prepare('SELECT id FROM tasks WHERE id = ?').get(historical.id))
    assert.equal(service().ensureDailyTasks(), false)
  } finally {
    database.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('习惯归档及恢复失败时整体回滚', () => {
  const database = new AppDatabase(':memory:')
  const service = new AppService(
    database,
    new TaskRepository(database.connection),
    () => new Date(2026, 10, 2),
    {
      habits: new HabitRepository(database.connection)
    }
  )
  try {
    const habit = service.createHabit('归档事务')
    database.connection.exec(
      "CREATE TRIGGER fail_archive BEFORE DELETE ON tasks BEGIN SELECT RAISE(ABORT, 'archive failed'); END"
    )
    assert.throws(() => service.archiveHabit(habit.id), /archive failed/)
    assert.deepEqual(service.listHabits(), [habit])
    assert.equal(service.listToday().tasks.length, 1)
    database.connection.exec('DROP TRIGGER fail_archive')
    service.archiveHabit(habit.id)
    database.connection.exec(
      "CREATE TRIGGER fail_restore BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'restore failed'); END"
    )
    assert.throws(() => service.restoreHabit(habit.id), /restore failed/)
    assert.deepEqual(service.listArchivedHabits(), [habit])
    database.connection.exec('DROP TRIGGER fail_restore')
    service.restoreHabit(habit.id)
    assert.equal(service.listToday().tasks.length, 1)
    assert.equal(service.ensureDailyTasks(), false)
  } finally {
    database.close()
  }
})

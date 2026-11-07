import assert from 'node:assert/strict'
import test from 'node:test'
import { AppDatabase } from '../src/main/storage/database'
import { AppService } from '../src/main/core/app-service'
import { TaskRepository } from '../src/main/storage/repositories/tasks'
import { HabitRepository } from '../src/main/storage/repositories/habits'
import { formatCreatedTime } from '../src/shared/created-time'

test('创建时间按本地自然日显示，跨年日期完整，旧记录不推测时间', () => {
  const now = new Date(2026, 10, 2, 12)
  assert.equal(formatCreatedTime(new Date(2026, 10, 2, 0, 5).toISOString(), now), '00:05')
  assert.equal(
    formatCreatedTime(new Date(2026, 10, 1, 23, 59).toISOString(), now),
    '2026年11月01日 23:59'
  )
  assert.equal(
    formatCreatedTime(new Date(2025, 10, 2, 8, 9).toISOString(), now),
    '2025年11月02日 08:09'
  )
  assert.equal(formatCreatedTime(null, now), '未知')
  assert.equal(formatCreatedTime(undefined, now), '未知')
  assert.equal(formatCreatedTime('invalid', now), '未知')
})

test('任务和习惯保存核心时钟的创建时间，编辑、转换、归档恢复及每日生成保留各自时间', () => {
  const database = new AppDatabase(':memory:')
  let now = new Date(2026, 10, 1, 23, 59)
  const service = new AppService(database, new TaskRepository(database.connection), () => now, {
    habits: new HabitRepository(database.connection)
  })
  try {
    const task = service.createTask('持续推进')
    const habit = service.setHabitSchedule(service.createHabit('每日检查').id, {
      kind: 'daily',
      time: '00:00'
    })
    assert.equal(task.createdAt, now.toISOString())
    assert.equal(habit.createdAt, now.toISOString())
    assert.equal(
      service.listToday().tasks.find((item) => item.habitId === habit.id)?.createdAt,
      now.toISOString()
    )
    service.convertToMultiDay(task.id)
    service.archiveTask(task.id)
    service.archiveHabit(habit.id)
    now = new Date(2026, 10, 2, 8, 10)
    assert.equal(service.restoreTask(task.id).createdAt, task.createdAt)
    assert.equal(service.updateTask(task.id, '更新任务').createdAt, task.createdAt)
    service.restoreHabit(habit.id)
    assert.equal(service.updateHabit(habit.id, '更新习惯').createdAt, habit.createdAt)
    assert.equal(
      service.listToday().tasks.find((item) => item.habitId === habit.id)?.createdAt,
      now.toISOString()
    )
    const converted = service.createTask('转为习惯')
    now = new Date(2026, 10, 2, 9)
    assert.equal(service.createHabitFromTask(converted.id).createdAt, now.toISOString())
    assert.equal(
      service.listToday().tasks.find((item) => item.id === converted.id)?.createdAt,
      converted.createdAt
    )
    now = new Date(2026, 10, 3, 8)
    service.ensureDailyTasks()
    assert.equal(
      service.listToday().tasks.find((item) => item.habitId === habit.id)?.createdAt,
      now.toISOString()
    )
  } finally {
    database.close()
  }
})

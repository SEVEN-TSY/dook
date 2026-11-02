import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/storage/database'
import { AppService } from '../src/main/core/app-service'
import { HabitRepository } from '../src/main/storage/repositories/habits'
import { TaskRepository } from '../src/main/storage/repositories/tasks'

function fixture() {
  const db = new AppDatabase(':memory:')
  let now = new Date(2026, 10, 2, 8)
  const service = new AppService(db, new TaskRepository(db.connection), () => now, {
    habits: new HabitRepository(db.connection)
  })
  return {
    db,
    service,
    at: (day: number, hour = 8, minute = 0) => {
      now = new Date(2026, 10, day, hour, minute)
    }
  }
}

test('新建习惯默认工作日07:00生成，保存默认规则并跳过周末和提前时间', () => {
  const { db, service, at } = fixture()
  try {
    at(2, 6, 59)
    const habit = service.createHabit('工作日检查')
    assert.deepEqual(habit.schedule, { kind: 'weekly', weekdays: [1, 2, 3, 4, 5], time: '07:00' })
    assert.deepEqual(service.listHabits()[0]?.schedule, habit.schedule)
    assert.equal(service.listToday().tasks.length, 0)
    at(2, 7)
    assert.equal(service.ensureDailyTasks(), true)
    assert.equal(service.ensureDailyTasks(), false)
    at(7, 12)
    assert.equal(service.ensureDailyTasks(), false)
    at(8, 12)
    assert.equal(service.ensureDailyTasks(), false)
    at(9, 7)
    assert.equal(service.ensureDailyTasks(), true)
    const converted = service.createHabitFromTask(service.createTask('转为工作日习惯').id)
    assert.deepEqual(converted.schedule, habit.schedule)
  } finally {
    db.close()
  }
})

test('每天按指定本地时间生成，保留已生成任务，完成删除或暂停后不重复生成', () => {
  const { db, service, at } = fixture()
  try {
    const habit = service.createHabit('定时检查')
    const original = service.listToday().tasks[0]!
    service.setTaskCompleted(original.id, true)
    service.setHabitSchedule(habit.id, { kind: 'daily', time: '09:30' })
    assert.equal(service.listToday().tasks[0]!.id, original.id)
    assert.equal(service.listToday().tasks[0]!.completed, true)
    at(3, 9, 29)
    assert.equal(service.ensureDailyTasks(), false)
    at(3, 9, 30)
    assert.equal(service.ensureDailyTasks(), true)
    assert.equal(service.ensureDailyTasks(), false)
    const generated = service.listToday().tasks[0]!
    assert.equal(generated.createdAt, new Date(2026, 10, 3, 9, 30).toISOString())
    service.deleteTask(generated.id)
    assert.equal(service.ensureDailyTasks(), false)
    at(4, 10)
    assert.equal(service.ensureDailyTasks(), true)
    service.skipHabitTask(service.listToday().tasks[0]!.id)
    assert.equal(service.ensureDailyTasks(), false)
    assert.equal(service.listToday().tasks.length, 0)
  } finally {
    db.close()
  }
})

test('每周只在所选星期生成，归档恢复遵循周期，星期去重排序且编辑保留周期', () => {
  const { db, service, at } = fixture()
  try {
    const habit = service.createHabit('周三周五')
    const updated = service.setHabitSchedule(habit.id, {
      kind: 'weekly',
      time: '08:00',
      weekdays: [5, 3, 5]
    })
    assert.deepEqual(updated.schedule?.weekdays, [3, 5])
    assert.deepEqual(service.updateHabit(habit.id, '修改正文').schedule, updated.schedule)
    at(3)
    assert.equal(service.ensureDailyTasks(), false)
    service.archiveHabit(habit.id)
    service.restoreHabit(habit.id)
    assert.equal(service.listToday().tasks.length, 0)
    at(4)
    assert.equal(service.ensureDailyTasks(), true)
    at(5)
    assert.equal(service.ensureDailyTasks(), false)
    at(6, 7, 59)
    assert.equal(service.ensureDailyTasks(), false)
    at(6, 8)
    assert.equal(service.ensureDailyTasks(), true)
    assert.equal(service.listToday().tasks.length, 1)
  } finally {
    db.close()
  }
})

test('每隔N天周期及起点跨重启保留，仅生成当前到期日，不补过去任务', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mytodo-schedule-'))
  const path = join(dir, 'app.sqlite')
  let db = new AppDatabase(path)
  let now = new Date(2026, 10, 2, 10)
  const open = () =>
    new AppService(db, new TaskRepository(db.connection), () => now, {
      habits: new HabitRepository(db.connection)
    })
  let service = open()
  try {
    const habit = service.createHabit('隔两天检查')
    const saved = service.setHabitSchedule(habit.id, {
      kind: 'interval',
      time: '09:00',
      intervalDays: 2
    })
    assert.equal(saved.schedule?.startsOn, '2026-11-02')
    db.close()
    db = new AppDatabase(path)
    service = open()
    assert.deepEqual(service.listHabits()[0]?.schedule, saved.schedule)
    now = new Date(2026, 10, 3, 10)
    assert.equal(service.ensureDailyTasks(), false)
    assert.equal(
      service.setHabitSchedule(habit.id, { kind: 'interval', time: '10:30', intervalDays: 2 })
        .schedule?.startsOn,
      '2026-11-02'
    )
    now = new Date(2026, 10, 8, 11)
    assert.equal(service.ensureDailyTasks(), true)
    assert.equal(service.listToday().tasks.length, 1)
    assert.equal(
      db.connection
        .prepare('SELECT COUNT(*) AS count FROM habit_generations WHERE habit_id = ?')
        .get(habit.id)?.count,
      2
    )
    service.archiveHabit(habit.id)
    assert.throws(
      () => service.setHabitSchedule(habit.id, { kind: 'daily', time: '00:00' }),
      /习惯不存在/
    )
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('非法周期不写入，任务生成失败时周期修改与生成记录整体回滚', () => {
  const { db, service, at } = fixture()
  try {
    const habit = service.createHabit('周期校验')
    for (const invalid of [
      null,
      { kind: 'weekly', time: '08:00', weekdays: [] },
      { kind: 'weekly', time: '08:00', weekdays: [0] },
      { kind: 'daily', time: '24:00' },
      { kind: 'interval', time: '08:00', intervalDays: 1.5 },
      { kind: 'interval', time: '08:00', intervalDays: 0 },
      { kind: 'interval', time: '08:00', intervalDays: 366 }
    ]) {
      assert.throws(() => service.setHabitSchedule(habit.id, invalid))
      assert.deepEqual(service.listHabits(), [habit])
    }
    at(3)
    db.connection.exec(
      "CREATE TRIGGER fail_schedule BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'schedule failed'); END"
    )
    assert.throws(
      () => service.setHabitSchedule(habit.id, { kind: 'daily', time: '00:00' }),
      /schedule failed/
    )
    assert.deepEqual(service.listHabits(), [habit])
    assert.equal(service.listToday().tasks.length, 0)
    db.connection.exec('DROP TRIGGER fail_schedule')
    assert.equal(service.ensureDailyTasks(), true)
  } finally {
    db.close()
  }
})

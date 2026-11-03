import assert from 'node:assert/strict'
import test from 'node:test'
import { AppDatabase } from '../src/main/storage/database'
import { TaskRepository } from '../src/main/storage/repositories/tasks'
import { AppService } from '../src/main/core/app-service'

test('今天任务添加首个子事项原子转换为多天任务并按子事项计算进度', () => {
  const database = new AppDatabase(':memory:')
  const service = new AppService(database, new TaskRepository(database.connection))
  try {
    const task = service.createTask('整理需求')
    assert.throws(() => service.addSubitem(task.id, '   '), /子事项/)
    assert.equal(service.listToday().tasks[0]?.kind, 'today')
    const updated = service.addSubitem(task.id, '  收集反馈  ')
    assert.equal(updated.id, task.id)
    assert.equal(updated.kind, 'multi-day')
    assert.equal(updated.progress, 0)
    assert.deepEqual(
      updated.subitems?.map(({ description, completed }) => ({ description, completed })),
      [{ description: '收集反馈', completed: false }]
    )
    assert.throws(() => service.setTaskProgress(task.id, 50), /子事项/)
  } finally {
    database.close()
  }
})

test('子事项编辑勾选删除联动整条任务，最后删除恢复手动进度', () => {
  const database = new AppDatabase(':memory:')
  const service = new AppService(database, new TaskRepository(database.connection))
  try {
    const task = service.createTask('整理需求')
    const first = service.addSubitem(task.id, '收集反馈').subitems![0]!
    const second = service.addSubitem(task.id, '梳理边界').subitems![1]!
    assert.equal(
      service.updateSubitem(task.id, first.id, '  收集用户反馈  ').subitems![0]!.description,
      '收集用户反馈'
    )
    assert.throws(() => service.updateSubitem(task.id, first.id, '  '), /子事项/)
    const half = service.setSubitemCompleted(task.id, first.id, true)
    assert.equal(half.progress, 50)
    assert.equal(half.completed, false)
    const all = service.setTaskCompleted(task.id, true)
    assert.equal(all.progress, 100)
    assert.deepEqual(
      all.subitems!.map((item) => item.completed),
      [true, true]
    )
    const none = service.setTaskCompleted(task.id, false)
    assert.deepEqual(
      none.subitems!.map((item) => item.completed),
      [false, false]
    )
    assert.equal(none.progress, 0)
    service.setSubitemCompleted(task.id, first.id, true)
    assert.equal(service.deleteSubitem(task.id, second.id).progress, 100)
    const manual = service.deleteSubitem(task.id, first.id)
    assert.equal(manual.subitems, undefined)
    assert.equal(manual.kind, 'multi-day')
    assert.equal(manual.progress, 100)
    assert.equal(service.setTaskProgress(task.id, 45).progress, 45)
    assert.throws(() => service.updateSubitem(task.id, first.id, '旧编辑'), /不存在/)
  } finally {
    database.close()
  }
})

test('子事项转换失败回滚且不能通过其他任务修改子事项', () => {
  const database = new AppDatabase(':memory:')
  const service = new AppService(database, new TaskRepository(database.connection))
  try {
    const first = service.createTask('整理需求')
    database.connection.exec(
      `CREATE TRIGGER fail_subitem BEFORE INSERT ON task_subitems BEGIN SELECT RAISE(ABORT, '模拟SQLite写入失败'); END`
    )
    assert.throws(() => service.addSubitem(first.id, '收集反馈'), /写入失败/)
    assert.equal(service.listToday().tasks[0]?.kind, 'today')
    database.connection.exec('DROP TRIGGER fail_subitem')
    const item = service.addSubitem(first.id, '收集反馈').subitems![0]!
    const second = service.createTask('检查构建')
    assert.throws(() => service.setSubitemCompleted(second.id, item.id, true), /不存在/)
    assert.equal(
      service.listToday().tasks.find((task) => task.id === first.id)?.subitems![0]?.completed,
      false
    )
  } finally {
    database.close()
  }
})

test('子事项在跨日和重启后保留，全部完成当日显示且次日隐藏', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join, dirname, resolve } = await import('node:path')
  const directory = mkdtempSync(join(tmpdir(), 'mytodo-subitems-'))
  const path = join(directory, 'app.sqlite')
  let database = new AppDatabase(path)
  let now = new Date(2026, 9, 27, 23, 59)
  let service = new AppService(database, new TaskRepository(database.connection), () => now)
  try {
    const task = service.createTask('整理需求')
    const item = service.addSubitem(task.id, '收集反馈').subitems![0]!
    database.close()
    database = new AppDatabase(path)
    now = new Date(2026, 9, 28, 0, 1)
    service = new AppService(database, new TaskRepository(database.connection), () => now)
    assert.equal(service.listToday().tasks[0]?.subitems![0]?.description, '收集反馈')
    const completed = service.setSubitemCompleted(task.id, item.id, true)
    assert.equal(completed.progress, 100)
    assert.equal(completed.completedOn, '2026-10-28')
    assert.equal(service.listToday().tasks.length, 1)
    now = new Date(2026, 9, 29, 0, 1)
    assert.deepEqual(service.listToday().tasks, [])
  } finally {
    database.close()
    assert.equal(resolve(dirname(directory)), resolve(tmpdir()))
    rmSync(directory, { recursive: true, force: true })
  }
})

test('无子事项多天任务转回本地当天，有子事项拒绝转换并保留创建时间', () => {
  const database = new AppDatabase(':memory:')
  const service = new AppService(database, new TaskRepository(database.connection))
  try {
    const task = service.createTask('转换与推进时间')
    service.convertToMultiDay(task.id)
    service.setTaskProgress(task.id, 50)
    const today = service.convertToToday(task.id)
    assert.equal(today.kind, 'today')
    assert.equal(today.date, service.listToday().date)
    assert.equal(today.completed, false)
    assert.equal(today.progress, 0)
    const updated = service.addSubitem(task.id, '新增工作')
    assert.equal(updated.createdAt, task.createdAt)
    assert.ok(updated.updatedAt)
    assert.throws(() => service.convertToToday(task.id), /子事项/)
    assert.equal(service.listToday().tasks[0].kind, 'multi-day')
    const converted = service.convertToToday(task.id, true)
    assert.equal(converted.kind, 'today')
    assert.equal(converted.subitems?.length ?? 0, 0)
  } finally {
    database.close()
  }
})

test('子事项同任务排序保留内容完成状态和进度，拒绝跨任务移动', () => {
  const database = new AppDatabase(':memory:')
  const service = new AppService(database, new TaskRepository(database.connection))
  try {
    const task = service.createTask('子事项排序')
    const first = service.addSubitem(task.id, '甲').subitems![0]
    const second = service.addSubitem(task.id, '乙').subitems![1]
    const third = service.addSubitem(task.id, '丙').subitems![2]
    service.setSubitemCompleted(task.id, second.id, true)
    const moved = service.moveSubitem(task.id, third.id, first.id, true)
    assert.deepEqual(
      moved.subitems!.map((item) => item.description),
      ['丙', '甲', '乙']
    )
    assert.equal(moved.progress, 33)
    assert.equal(moved.subitems![2].completed, true)
    const appended = service.addSubitem(task.id, '丁')
    assert.deepEqual(
      appended.subitems!.map((item) => item.description),
      ['丙', '甲', '乙', '丁']
    )
    const other = service.createTask('另一任务')
    const foreign = service.addSubitem(other.id, '外部项').subitems![0]
    assert.throws(() => service.moveSubitem(task.id, first.id, foreign.id, false), /同一任务/)
    assert.deepEqual(
      service
        .moveSubitem(task.id, first.id, third.id, false)
        .subitems!.map((item) => item.description),
      ['丙', '甲', '乙', '丁']
    )
  } finally {
    database.close()
  }
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/storage/database'
import { AppService } from '../src/main/core/app-service'
import { TaskRepository } from '../src/main/storage/repositories/tasks'

test('跨日到达的自动保存不把昨天输入创建为今天任务', () => {
  const database = new AppDatabase(':memory:')
  const service = new AppService(
    database,
    new TaskRepository(database.connection),
    () => new Date(2026, 9, 28, 0, 0)
  )
  try {
    assert.throws(() => service.createTask('昨天尚未保存的输入', '2026-10-27'), /日期已切换/)
    assert.equal(service.listToday().tasks.length, 0)
    assert.equal(service.createTask('今天的输入', '2026-10-28').date, '2026-10-28')
  } finally {
    database.close()
  }
})

test('今天任务去除空白并新增位于普通任务首位，跨日不延续', () => {
  const database = new AppDatabase(':memory:')
  let now = new Date(2026, 9, 27, 23, 59)
  const service = new AppService(database, new TaskRepository(database.connection), () => now)
  try {
    assert.throws(() => service.createTask('   '), /任务描述/)
    const first = service.createTask('  检查构建状态  ')
    const second = service.createTask('整理待办')
    assert.equal(first.description, '检查构建状态')
    assert.equal(first.date, '2026-10-27')
    assert.equal(first.completed, false)
    assert.deepEqual(service.listToday().tasks, [second, first])
    now = new Date(2026, 9, 28, 0, 0)
    assert.deepEqual(service.listToday(), { date: '2026-10-28', tasks: [] })
    now = new Date(2026, 9, 27, 12)
    assert.deepEqual(service.listToday().tasks, [second, first])
  } finally {
    database.close()
  }
})

test('编辑和完成保留日期与顺序，删除不被旧编辑恢复，重启保留结果', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mytodo-tasks-'))
  const path = join(directory, 'tasks.sqlite')
  let database = new AppDatabase(path)
  let now = new Date(2026, 9, 27, 12)
  const openService = () =>
    new AppService(database, new TaskRepository(database.connection), () => now)
  let service = openService()
  try {
    const first = service.createTask('检查构建')
    const second = service.createTask('待删除')
    assert.throws(() => service.updateTask(first.id, '  '), /任务描述/)
    assert.equal(
      service.listToday().tasks.find((task) => task.id === first.id)?.description,
      '检查构建'
    )
    service.setTaskCompleted(first.id, true)
    service.setTaskCompleted(first.id, false)
    service.setTaskCompleted(first.id, true)
    service.updateTask(first.id, ' 更新进展 ')
    assert.deepEqual(service.listToday().tasks, [
      second,
      { ...first, description: '更新进展', completed: true }
    ])
    service.deleteTask(second.id)
    assert.throws(() => service.updateTask(second.id, '旧编辑'), /不存在/)
    database.close()
    database = new AppDatabase(path)
    service = openService()
    assert.deepEqual(service.listToday().tasks, [
      { ...first, description: '更新进展', completed: true }
    ])
    now = new Date(2026, 9, 28, 12)
    assert.deepEqual(service.listToday().tasks, [])
    assert.throws(() => service.updateTask(first.id, '跨日编辑'), /不存在/)
    now = new Date(2026, 9, 27, 12)
    assert.deepEqual(service.listToday().tasks, [
      { ...first, description: '更新进展', completed: true }
    ])
  } finally {
    database.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('分类内排序与置顶持久化，完成不改顺序，跨分类或置顶分区拖动不写入', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mytodo-order-'))
  const path = join(directory, 'tasks.sqlite')
  let database = new AppDatabase(path)
  let now = new Date(2026, 9, 28, 12)
  const open = () => new AppService(database, new TaskRepository(database.connection), () => now)
  let service = open()
  const ids = () => service.listToday().tasks.map((task) => task.id)
  try {
    const a = service.createTask('今天一')
    const b = service.createTask('今天二')
    const c = service.createTask('今天三')
    const d = service.createTask('推进一')
    const e = service.createTask('推进二')
    service.convertToMultiDay(d.id)
    service.convertToMultiDay(e.id)
    service.moveTask(b.id, a.id, false)
    service.moveTask(c.id, a.id, true)
    service.moveTask(e.id, d.id, true)
    assert.deepEqual(ids(), [c.id, a.id, b.id, e.id, d.id])
    service.moveTask(c.id, b.id, false)
    assert.deepEqual(ids(), [a.id, b.id, c.id, e.id, d.id])
    service.setTaskPinned(b.id, true)
    service.setTaskPinned(c.id, true)
    service.moveTask(b.id, c.id, true)
    service.setTaskPinned(d.id, true)
    service.setTaskCompleted(b.id, true)
    const expected = [b.id, c.id, a.id, d.id, e.id]
    assert.deepEqual(ids(), expected)
    assert.throws(() => service.moveTask(a.id, d.id, true), /同一分类/)
    assert.throws(() => service.moveTask(a.id, b.id, true), /同一分类/)
    assert.throws(() => service.moveTask(a.id, 'missing', true), /不存在/)
    assert.deepEqual(ids(), expected)
    database.close()
    database = new AppDatabase(path)
    service = open()
    assert.deepEqual(ids(), expected)
    assert.equal(service.listToday().tasks[0].pinned, true)
    service.setTaskPinned(b.id, false)
    assert.deepEqual(ids(), [c.id, b.id, a.id, d.id, e.id])
    const added = service.createTask('新增排在普通任务首位')
    assert.deepEqual(ids(), [c.id, added.id, b.id, a.id, d.id, e.id])
    now = new Date(2026, 9, 29, 12)
    assert.deepEqual(ids(), [d.id, e.id])
    assert.throws(() => service.setTaskPinned(a.id, true), /不存在/)
  } finally {
    database.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

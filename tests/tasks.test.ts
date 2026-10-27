import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/storage/database'
import { AppService } from '../src/main/core/app-service'
import { TaskRepository } from '../src/main/storage/repositories/tasks'

test('今天任务去除空白并按创建顺序展示，跨日不延续', () => {
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
    assert.deepEqual(service.listToday().tasks, [first, second])
    now = new Date(2026, 9, 28, 0, 0)
    assert.deepEqual(service.listToday(), { date: '2026-10-28', tasks: [] })
    now = new Date(2026, 9, 27, 12)
    assert.deepEqual(service.listToday().tasks, [first, second])
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
    assert.equal(service.listToday().tasks[0]?.description, '检查构建')
    service.setTaskCompleted(first.id, true)
    service.setTaskCompleted(first.id, false)
    service.setTaskCompleted(first.id, true)
    service.updateTask(first.id, ' 更新进展 ')
    assert.deepEqual(service.listToday().tasks, [
      { ...first, description: '更新进展', completed: true },
      second
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

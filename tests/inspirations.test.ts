import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/storage/database'
import { TaskRepository } from '../src/main/storage/repositories/tasks'
import { InspirationRepository } from '../src/main/storage/repositories/inspirations'
import { AppService } from '../src/main/core/app-service'

test('灵感创建后可读取，保留顺序且不产生今天任务', () => {
  const database = new AppDatabase(':memory:')
  const service = new AppService(database, new TaskRepository(database.connection), undefined, {
    inspirations: new InspirationRepository(database.connection)
  })
  try {
    assert.throws(() => service.createInspiration('  '), /灵感/)
    const first = service.createInspiration('  自动整理需求  ')
    const second = service.createInspiration('探索构建报告')
    assert.equal(first.description, '自动整理需求')
    assert.deepEqual(first.additions, [])
    assert.deepEqual(service.listInspirations(), [first, second])
    assert.deepEqual(service.listToday().tasks, [])
  } finally {
    database.close()
  }
})

test('灵感原始想法可编辑，补充内容按追加顺序保留并跨日重启恢复', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mytodo-inspirations-'))
  const path = join(directory, 'app.sqlite')
  let database = new AppDatabase(path)
  let now = new Date(2026, 9, 27, 23, 59)
  const open = () =>
    new AppService(database, new TaskRepository(database.connection), () => now, {
      inspirations: new InspirationRepository(database.connection)
    })
  let service = open()
  try {
    const idea = service.createInspiration('需求草稿')
    assert.throws(() => service.updateInspiration(idea.id, ' '), /灵感/)
    assert.throws(() => service.appendInspiration(idea.id, ' '), /补充/)
    service.appendInspiration(idea.id, '  第一次探索  ')
    service.updateInspiration(idea.id, '需求整合工具')
    service.appendInspiration(idea.id, '第二次探索')
    const expected = service.listInspirations()
    assert.equal(expected[0]?.description, '需求整合工具')
    assert.deepEqual(
      expected[0]?.additions.map((addition) => addition.content),
      ['第一次探索', '第二次探索']
    )
    assert.equal(new Set(expected[0]?.additions.map((addition) => addition.id)).size, 2)
    assert.throws(() => service.appendInspiration('missing', '补充'), /不存在/)
    assert.throws(() => service.updateInspiration('missing', '修改'), /不存在/)
    now = new Date(2026, 9, 28, 1)
    database.close()
    database = new AppDatabase(path)
    service = open()
    assert.deepEqual(service.listInspirations(), expected)
    assert.deepEqual(service.listToday().tasks, [])
  } finally {
    database.close()
    assert.equal(join(tmpdir(), directory.split(/[\\/]/).at(-1)!), directory)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('同一轮补充保存追赶新输入时复用补充标识，不重复追加', () => {
  const database = new AppDatabase(':memory:')
  const service = new AppService(database, undefined, undefined, {
    inspirations: new InspirationRepository(database.connection)
  })
  try {
    const idea = service.createInspiration('需求整合')
    service.appendInspiration(idea.id, '先探索', 'input-session-one')
    service.appendInspiration(idea.id, '先探索再落地', 'input-session-one')
    service.appendInspiration(idea.id, '第二次补充', 'input-session-two')
    assert.deepEqual(
      service.listInspirations()[0]?.additions.map((item) => item.content),
      ['先探索再落地', '第二次补充']
    )
    const other = service.createInspiration('另一个想法')
    assert.throws(
      () => service.appendInspiration(other.id, '不能覆盖别条灵感', 'input-session-one'),
      /补充/
    )
  } finally {
    database.close()
  }
})

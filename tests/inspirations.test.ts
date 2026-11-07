import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/storage/database'
import { DatabaseSync } from 'node:sqlite'
import { migrations } from '../src/main/storage/migrations'
import { TaskRepository } from '../src/main/storage/repositories/tasks'
import { InspirationRepository } from '../src/main/storage/repositories/inspirations'
import { AppService } from '../src/main/core/app-service'

test('小记创建后可读取，保留顺序且不产生今天任务', () => {
  const database = new AppDatabase(':memory:')
  const service = new AppService(database, new TaskRepository(database.connection), undefined, {
    inspirations: new InspirationRepository(database.connection)
  })
  try {
    assert.throws(() => service.createInspiration('  '), /小记/)
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

test('小记原始想法可编辑，补充内容按追加顺序保留并跨日重启恢复', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dook-inspirations-'))
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
    assert.throws(() => service.updateInspiration(idea.id, ' '), /小记/)
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
      () => service.appendInspiration(other.id, '不能覆盖别条小记', 'input-session-one'),
      /补充/
    )
  } finally {
    database.close()
  }
})

test('小记分页按原始记录时间倒序且跨日编辑保持时间', () => {
  const database = new AppDatabase(':memory:')
  let now = new Date(2026, 9, 28, 12)
  const service = new AppService(database, undefined, () => now, {
    inspirations: new InspirationRepository(database.connection)
  })
  try {
    const first = service.createInspiration('第一条')
    const second = service.createInspiration('第二条')
    now = new Date(2026, 9, 29, 12)
    service.updateInspiration(first.id, '编辑')
    const page = service.listInspirationPage(0, 1)
    assert.equal(page.items[0]?.id, second.id)
    assert.equal(page.hasMore, true)
    assert.equal(service.listInspirationPage(1, 1).items[0]?.createdAt, first.createdAt)
  } finally {
    database.close()
  }
})

test('旧小记迁移保留原文补充并在分页中排在新小记之后', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dook-old-inspirations-'))
  const path = join(directory, 'app.sqlite')
  const old = new DatabaseSync(path)
  old.exec(
    'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT'
  )
  for (const migration of migrations.filter((item) => item.version <= 8)) {
    old.exec(migration.sql)
    old
      .prepare('INSERT INTO schema_migrations VALUES (?, ?, ?)')
      .run(migration.version, migration.name, 'old')
  }
  old.prepare('INSERT INTO inspirations (id, description) VALUES (?, ?)').run('old', '旧小记')
  old
    .prepare('INSERT INTO inspiration_additions (id, inspiration_id, content) VALUES (?, ?, ?)')
    .run('addition', 'old', '旧补充')
  old.close()
  const database = new AppDatabase(path)
  const service = new AppService(database, undefined, () => new Date(2026, 9, 28), {
    inspirations: new InspirationRepository(database.connection)
  })
  try {
    for (let i = 0; i < 25; i++) service.createInspiration(`小记${i}`)
    const first = service.listInspirationPage(0, 20)
    const second = service.listInspirationPage(20, 20)
    const all = [...first.items, ...second.items]
    assert.equal(first.hasMore, true)
    assert.equal(second.hasMore, false)
    assert.equal(new Set(all.map((item) => item.id)).size, 26)
    assert.deepEqual(all.at(-1), {
      id: 'old',
      description: '旧小记',
      createdAt: null,
      topicIds: [],
      additions: [{ id: 'addition', content: '旧补充' }]
    })
  } finally {
    database.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('按主题分页只返回该主题的小记', () => {
  const database = new AppDatabase(':memory:')
  const service = new AppService(database, undefined, undefined, {
    inspirations: new InspirationRepository(database.connection)
  })
  try {
    const first = service.createInspiration('第一条')
    const topic = service.createInspirationTopic('主题', first.id)
    service.createInspiration('其他小记')
    const second = service.createInspiration('第二条')
    service.setInspirationTopic(second.id, topic.id, true)
    const page = service.listInspirationPage(0, 1, { kind: 'topic', topicId: topic.id })
    assert.equal(page.items[0]?.id, second.id)
    assert.equal(page.hasMore, true)
    assert.equal(
      service.listInspirationPage(1, 1, { kind: 'topic', topicId: topic.id }).items[0]?.id,
      first.id
    )
  } finally {
    database.close()
  }
})

test('日期分页按本地自然日区分今天和历史', () => {
  const database = new AppDatabase(':memory:')
  let now = new Date(2026, 9, 20, 12)
  const service = new AppService(database, undefined, () => now, {
    inspirations: new InspirationRepository(database.connection)
  })
  try {
    const old = service.createInspiration('历史')
    now = new Date(2026, 9, 28, 12)
    const today = service.createInspiration('今天')
    const start = new Date(2026, 9, 28).toISOString()
    const end = new Date(2026, 9, 29).toISOString()
    assert.deepEqual(
      service.listInspirationPage(0, 20, { kind: 'date', start, end }).items.map((item) => item.id),
      [today.id]
    )
    assert.deepEqual(
      service
        .listInspirationPage(0, 20, {
          kind: 'history',
          start: new Date(2026, 9, 22).toISOString(),
          end
        })
        .items.map((item) => item.id),
      [old.id]
    )
  } finally {
    database.close()
  }
})

test('主题内创建小记同时归集，主题失效时不留下小记', () => {
  const database = new AppDatabase(':memory:')
  const service = new AppService(database, undefined, () => new Date('2026-10-28T12:00:00Z'), {
    inspirations: new InspirationRepository(database.connection)
  })
  try {
    const seed = service.createInspiration('已有小记')
    const topic = service.createInspirationTopic('主题', seed.id)
    const created = service.createInspiration('新小记', topic.id)
    assert.deepEqual(created.topicIds, [topic.id])
    assert.equal(created.createdAt, '2026-10-28T12:00:00.000Z')
    const retried = service.createInspiration('重试小记', topic.id, 'stable-id')
    assert.equal(service.createInspiration('重试小记', topic.id, 'stable-id').id, retried.id)
    assert.throws(() => service.createInspiration('失败小记', 'missing'), /主题/)
    assert.deepEqual(
      service.listInspirations().map((item) => item.description),
      ['已有小记', '新小记', '重试小记']
    )
  } finally {
    database.close()
  }
})

test('主题可独立创建，删除后保留小记及其他主题', () => {
  const database = new AppDatabase(':memory:')
  const service = new AppService(database, new TaskRepository(database.connection), undefined, {
    inspirations: new InspirationRepository(database.connection)
  })
  try {
    const first = service.createInspiration('想法')
    service.appendInspiration(first.id, '补充')
    const topic = service.createInspirationTopic('独立主题')
    const other = service.createInspirationTopic('其他主题', first.id)
    service.setInspirationTopic(first.id, topic.id, true)
    assert.equal(service.inspirationTopicDetails(topic.id).count, 1)
    service.deleteInspirationTopic(topic.id)
    assert.deepEqual(service.listInspirations()[0]?.topicIds, [other.id])
    assert.equal(service.listInspirations()[0]?.additions[0]?.content, '补充')
  } finally {
    database.close()
  }
})

test('主题新建、归集时新建和改名均限制名称为20个字', () => {
  const database = new AppDatabase(':memory:')
  const service = new AppService(database, undefined, undefined, {
    inspirations: new InspirationRepository(database.connection)
  })
  try {
    const name = '字'.repeat(20)
    const tooLong = `${name}长`
    const idea = service.createInspiration('想法')
    const topic = service.createInspirationTopic(` ${name} `)
    assert.equal(topic.name, name)
    assert.throws(() => service.createInspirationTopic(tooLong), /最多20个字/)
    assert.throws(() => service.createInspirationTopic(tooLong, idea.id), /最多20个字/)
    assert.throws(() => service.renameInspirationTopic(topic.id, tooLong), /最多20个字/)
    assert.deepEqual(service.listInspirationTopics(), [topic])
    assert.deepEqual(service.listInspirations()[0]?.topicIds, [])

    const newName = '名'.repeat(20)
    service.renameInspirationTopic(topic.id, newName)
    assert.equal(service.inspirationTopicDetails(topic.id).name, newName)
  } finally {
    database.close()
  }
})

test('归档保留内容和主题，禁止旧编辑，恢复后可删除已归档记录', () => {
  const database = new AppDatabase(':memory:')
  const service = new AppService(database, undefined, undefined, {
    inspirations: new InspirationRepository(database.connection)
  })
  try {
    const idea = service.createInspiration('想法')
    const topic = service.createInspirationTopic('主题', idea.id)
    service.appendInspiration(idea.id, '补充')
    service.archiveInspiration(idea.id)
    assert.deepEqual(service.listInspirations(), [])
    assert.equal(
      service.listInspirationPage(0, 20, { kind: 'archive' }).items[0]?.additions[0]?.content,
      '补充'
    )
    assert.throws(() => service.updateInspiration(idea.id, '旧编辑'))
    assert.throws(() => service.appendInspiration(idea.id, '旧补充'))
    assert.throws(() => service.setInspirationTopic(idea.id, topic.id, false))
    service.restoreInspiration(idea.id)
    assert.deepEqual(service.listInspirations()[0]?.topicIds, [topic.id])
    assert.throws(() => service.deleteArchivedInspiration(idea.id))
    service.archiveInspiration(idea.id)
    service.deleteArchivedInspiration(idea.id)
    assert.deepEqual(service.listInspirationPage(0, 20, { kind: 'archive' }).items, [])
    assert.throws(() => service.restoreInspiration(idea.id))
  } finally {
    database.close()
  }
})

test('归档状态、内容和主题跨重启保留，恢复后重新进入主题', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dook-archive-'))
  const path = join(directory, 'app.sqlite')
  let database = new AppDatabase(path)
  let now = new Date('2026-11-06T08:00:00Z')
  const open = () =>
    new AppService(database, undefined, () => now, {
      inspirations: new InspirationRepository(database.connection)
    })
  try {
    let service = open()
    const topic = service.createInspirationTopic('持久主题')
    const idea = service.createInspiration('持久小记', topic.id)
    service.appendInspiration(idea.id, '持久补充')
    now = new Date('2026-11-07T09:00:00Z')
    service.archiveInspiration(idea.id)
    assert.equal(
      database.connection.prepare('SELECT archived_at FROM inspirations WHERE id = ?').get(idea.id)
        ?.archived_at,
      now.toISOString()
    )
    database.close()
    database = new AppDatabase(path)
    service = open()
    assert.deepEqual(service.listInspirations(), [])
    const archived = service.listInspirationPage(0, 20, { kind: 'archive' }).items[0]
    assert.equal(archived?.id, idea.id)
    assert.equal(archived?.createdAt, idea.createdAt)
    assert.equal(archived?.archivedAt, now.toISOString())
    assert.deepEqual(archived?.topicIds, [topic.id])
    assert.equal(archived?.additions[0]?.content, '持久补充')
    service.restoreInspiration(idea.id)
    assert.equal(service.listInspirationPage(0, 20).items[0]?.archivedAt, undefined)
    now = new Date('2026-11-08T10:00:00Z')
    service.archiveInspiration(idea.id)
    assert.equal(
      service.listInspirationPage(0, 20, { kind: 'archive' }).items[0]?.archivedAt,
      now.toISOString()
    )
    assert.equal(
      service.listInspirationPage(0, 20, { kind: 'archive' }).items[0]?.createdAt,
      idea.createdAt
    )
    service.restoreInspiration(idea.id)
    assert.equal(
      service.listInspirationPage(0, 20, { kind: 'topic', topicId: topic.id }).items[0]?.id,
      idea.id
    )
  } finally {
    database.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('归档分页与普通分页隔离，删除失败回滚关联并可恢复', () => {
  const database = new AppDatabase(':memory:')
  const service = new AppService(database, undefined, undefined, {
    inspirations: new InspirationRepository(database.connection)
  })
  try {
    const topic = service.createInspirationTopic('主题')
    const ids: string[] = []
    for (let i = 0; i < 25; i++) {
      const idea = service.createInspiration(`小记${i}`)
      service.setInspirationTopic(idea.id, topic.id, true)
      service.appendInspiration(idea.id, '补充')
      ids.push(idea.id)
      service.archiveInspiration(idea.id)
    }
    const first = service.listInspirationPage(0, 20, { kind: 'archive' })
    const second = service.listInspirationPage(20, 20, { kind: 'archive' })
    assert.equal(first.hasMore, true)
    assert.equal(second.hasMore, false)
    assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 25)
    assert.equal(
      service.listInspirationPage(0, 20, { kind: 'topic', topicId: topic.id }).items.length,
      0
    )
    database.connection.exec(
      "CREATE TRIGGER prevent_delete BEFORE DELETE ON inspiration_additions BEGIN SELECT RAISE(ABORT, '阻止删除'); END"
    )
    assert.throws(() => service.deleteArchivedInspiration(ids[0]))
    const retained = service
      .listInspirationPage(0, 100, { kind: 'archive' })
      .items.find((item) => item.id === ids[0])
    assert.deepEqual(retained?.topicIds, [topic.id])
    assert.equal(retained?.additions[0]?.content, '补充')
    database.connection.exec('DROP TRIGGER prevent_delete')
    service.deleteInspirationTopic(topic.id)
    service.restoreInspiration(ids[0])
    assert.equal(service.listInspirationPage(0, 20, { kind: 'unassigned' }).items[0]?.id, ids[0])
  } finally {
    database.close()
  }
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/storage/database'
import { TaskRepository } from '../src/main/storage/repositories/tasks'
import { AppService } from '../src/main/core/app-service'
import { DailyReportRepository } from '../src/main/storage/repositories/daily-reports'
import { DailyReports } from '../src/main/core/daily-reports'
import { DailyReportSession } from '../src/main/desktop/daily-report-session'
import { AiConnection } from '../src/main/ai/connection'
import { AiScenePrompts } from '../src/main/ai/scene-prompts'
import { AiCallLog } from '../src/main/storage/ai-call-log'
import { HabitRepository } from '../src/main/storage/repositories/habits'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((finish) => {
    resolve = finish
  })
  return { promise, resolve }
}

test('日报发送当天材料并按原日期留存可编辑正文，主动创建后进入新一天', async () => {
  const database = new AppDatabase(':memory:')
  try {
    let now = new Date(2026, 10, 16, 18)
    const tasks = new TaskRepository(database.connection)
    const app = new AppService(database, tasks, () => now)
    const reports = new DailyReports(
      tasks,
      new DailyReportRepository(database.connection),
      () => now
    )
    const finished = app.createTask('修复导出')
    app.setTaskCompleted(finished.id, true)
    app.archiveTask(finished.id)
    app.createTask('补充回归用例')

    const result = await reports.generate(
      '2026-11-16',
      false,
      '',
      async (_, material) => {
        const sources = JSON.parse(material)
        assert.deepEqual(
          sources.map((source: { description: string }) => source.description),
          ['补充回归用例', '修复导出']
        )
        return JSON.stringify({
          today: { title: '今日工作内容', items: [{ sourceIds: [2], text: '修复导出异常' }] },
          tomorrow: { title: '明日工作计划', items: [{ sourceIds: [1], text: '继续补充回归用例' }] }
        })
      },
      new AbortController().signal
    )
    assert.equal(result?.body, '今日工作内容\n1. 修复导出异常\n\n明日工作计划\n1. 继续补充回归用例')
    assert.equal(result?.materialCount, 2)
    now = new Date(2026, 10, 17, 9)
    assert.equal(reports.view().date, '2026-11-16')
    reports.save('2026-11-16', '已提交')
    app.createTask('准备新一轮发布')
    assert.equal(reports.view().date, '2026-11-17')
    assert.equal(reports.read('2026-11-16')?.body, '已提交')
  } finally {
    database.close()
  }
})

test('日报按当天净增量计算进度，删除子事项不增加进展，隐藏后排除全部多天任务', async () => {
  const database = new AppDatabase(':memory:')
  try {
    let now = new Date(2026, 10, 15, 18)
    const tasks = new TaskRepository(database.connection)
    const app = new AppService(database, tasks, () => now)
    const reports = new DailyReports(
      tasks,
      new DailyReportRepository(database.connection),
      () => now
    )
    const manual = app.convertToMultiDay(app.createTask('迁移数据').id)
    app.setTaskProgress(manual.id, 40)
    const task = app.createTask('核对数据')
    const children = Array.from(
      { length: 6 },
      (_, index) => app.addSubitem(task.id, `数据集${index + 1}`).subitems!.at(-1)!.id
    )
    for (const id of children.slice(0, 2)) app.setSubitemCompleted(task.id, id, true)
    now = new Date(2026, 10, 16, 18)
    app.setTaskProgress(manual.id, 60)
    app.setSubitemCompleted(task.id, children[2]!, true)
    app.deleteSubitem(task.id, children[5]!)
    const archived = app.convertToMultiDay(app.createTask('发布版本').id)
    app.setTaskCompleted(archived.id, true)
    app.archiveTask(archived.id)
    assert.equal(reports.scope(false).hasHiddenMultiDay, true)
    assert.equal(reports.scope(false).materialCount, 0)
    const result = await reports.generate(
      '2026-11-16',
      true,
      '',
      async (_, material) => {
        assert.equal(JSON.parse(material).length, 3)
        return JSON.stringify({
          today: { title: '今日', items: [{ sourceIds: [1], text: '迁移数据' }] },
          tomorrow: {
            title: '明日',
            items: [
              { sourceIds: [1], text: '迁移数据' },
              { sourceIds: [2], text: '继续核对数据' }
            ]
          }
        })
      },
      new AbortController().signal
    )
    assert.match(result!.body, /迁移数据，进度60%/)
    assert.match(result!.body, /迁移数据，完成80%/)
    assert.match(result!.body, /继续核对数据，完成4\/5/)
    app.updateTask(task.id, '核对数据，明天累计完成5项')
    const generate = (complete: (prompt: string, material: string) => Promise<string>) =>
      reports.generate('2026-11-16', true, '', complete, new AbortController().signal)
    const modelItem = { sourceIds: [2], text: '继续核对数据' }
    const reply = (items: unknown[]) =>
      JSON.stringify({
        today: { title: '今日', items: [] },
        tomorrow: { title: '明日', items }
      })
    const explicit = await generate(async () => reply([modelItem]))
    assert.match(explicit!.body, /继续核对数据，完成5\/5/)
    for (const invalid of [
      reply([]),
      reply([modelItem, modelItem]),
      reply([{ ...modelItem, subitemIds: ['1.1'] }])
    ]) {
      await assert.rejects(
        generate(async () => invalid),
        /材料来源无效/
      )
      assert.deepEqual(reports.read('2026-11-16'), explicit)
    }
    app.updateTask(task.id, '测'.repeat(2001))
    let requested = false
    await assert.rejects(
      generate(async () => {
        requested = true
        return reply([modelItem])
      }),
      /每条任务或子事项描述最多2000字/
    )
    assert.equal(requested, false)
  } finally {
    database.close()
  }
})

test('日报发送前复核新增的隐藏任务，版本冲突、无效响应及取消保留最终正文', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'dook-report-'))
  const path = join(directory, 'test.sqlite')
  let database = new AppDatabase(path)
  t.after(() => {
    database.close()
    rmSync(directory, { recursive: true, force: true })
  })
  let time = new Date(2026, 10, 16, 18)
  const now = () => time
  const tasks = new TaskRepository(database.connection)
  const app = new AppService(database, tasks, now)
  const reports = new DailyReports(tasks, new DailyReportRepository(database.connection), now)
  app.setTaskCompleted(app.createTask('核对发布记录').id, true)

  const prompt = '用“交付”作为第一节标题。'
  const prompts = new AiScenePrompts(directory)
  prompts.save('daily_report', prompt)
  prompts.setMode('custom')
  const response = (sourceId: number) =>
    JSON.stringify({
      today: { title: '交付', items: [{ sourceIds: [sourceId], text: '核对发布记录' }] },
      tomorrow: { title: '后续', items: [] }
    })
  const envelope = (content: string, finish = 'stop') =>
    Response.json({
      choices: [{ finish_reason: finish, message: { content } }],
      usage: { total_tokens: 13 }
    })
  let incoming = () => Promise.resolve(envelope(response(1)))
  let networkSignal: AbortSignal | null | undefined
  let calls = 0
  let logged = 0
  let onDecrypt = () => {}
  const log = new AiCallLog(database.connection, directory)
  const ai = new AiConnection(
    directory,
    {
      available: async () => true,
      encrypt: async (key) => Buffer.from(key),
      decrypt: async (key) => {
        onDecrypt()
        return key.toString()
      }
    },
    log,
    async (_, request) => {
      const { messages } = JSON.parse(String(request?.body))
      if (messages[0].content === 'Reply OK.') return envelope('OK')
      calls++
      networkSignal = request?.signal
      assert.match(messages[0].content, /用“交付”作为第一节标题/)
      assert.deepEqual(
        JSON.parse(messages[1].content).map(
          ({ id, description }: { id: number; description: string }) => [id, description]
        ),
        [[1, '核对发布记录']]
      )
      return incoming()
    },
    () => logged++,
    { retryDelays: [] }
  )
  const configuration = (await ai.save({ presetId: 'deepseek-flash', key: 'test' })).activeId!
  let flush = () => {}
  const session = new DailyReportSession(
    reports,
    async () => ai,
    async () => prompts,
    () => false,
    async () => flush()
  )
  const before = await session.prepare()
  assert.equal(before.hasHiddenMultiDay, false)
  flush = () => {
    const task = app.convertToMultiDay(app.createTask('长周期事项').id)
    app.setTaskCompleted(task.id, true)
    app.archiveTask(task.id)
  }
  const recheck = await session.generate(before, false, () => {})
  assert.equal(calls, 0)
  assert.equal(recheck.kind, 'prepare')
  assert.ok(recheck.kind === 'prepare' && recheck.preparation.hasHiddenMultiDay)
  flush = () => {}
  const scope = recheck.preparation
  const initial = await session.generate(scope, true, () => {})
  assert.equal(initial.kind, 'saved')
  assert.match(reports.read(scope.date)!.body, /^交付\n1\. 核对发布记录/)

  let requestStarted = deferred<void>()
  let body = deferred<Response>()
  incoming = () => {
    requestStarted.resolve()
    return body.promise
  }
  const regeneration = session.generate(scope, true, () => {})
  await requestStarted.promise
  reports.beginEdit(scope.date)
  const edited = reports.save(scope.date, '已人工核对')
  body.resolve(envelope(response(1)))
  assert.deepEqual(await regeneration, { kind: 'superseded' })

  incoming = async () => envelope(response(2))
  await assert.rejects(
    session.generate(scope, true, () => {}),
    /材料来源无效/
  )
  assert.deepEqual(reports.read(scope.date), edited)

  incoming = async () => envelope(response(1), 'length')
  await assert.rejects(
    session.generate(scope, true, () => {}),
    /无效或不完整的响应/
  )
  assert.deepEqual(reports.read(scope.date), edited)

  onDecrypt = () => (time = new Date(2026, 10, 17, 0))
  const expired = await session.generate(scope, true, () => {})
  assert.ok(expired.kind === 'prepare' && expired.preparation.date === '2026-11-17')
  onDecrypt = () => {}
  time = new Date(2026, 10, 16, 18)

  requestStarted = deferred<void>()
  body = deferred<Response>()
  incoming = () => {
    requestStarted.resolve()
    return body.promise
  }
  const pending = session.generate(scope, true, () => {})
  await requestStarted.promise
  session.cancel()
  assert.equal(networkSignal?.aborted, true)
  body.resolve(envelope(response(1)))
  assert.deepEqual(await pending, { kind: 'cancelled' })
  assert.equal(calls, 5)
  assert.equal(logged, 6)
  assert.equal(log.summarize(configuration).totalTokens, 78)
  assert.deepEqual(reports.read(scope.date), edited)

  database.close()
  database = new AppDatabase(path)
  const store = new DailyReportRepository(database.connection)
  const nextDay = () => new Date(2026, 10, 17, 9)
  const nextTasks = new TaskRepository(database.connection)
  const nextReports = new DailyReports(nextTasks, store, nextDay)
  const nextApp = new AppService(database, nextTasks, nextDay, {
    habits: new HabitRepository(database.connection)
  })
  nextApp.createHabit('检查部署')
  assert.equal(nextReports.view().report?.body, '已人工核对')
  nextApp.createTask('开启新一天')
  assert.equal(nextReports.view().report, null)
  assert.deepEqual(nextReports.read(scope.date), edited)
})

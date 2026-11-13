import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { AiConnection } from '../src/main/ai/connection'
import { AiCallLog } from '../src/main/storage/ai-call-log'
import { AppDatabase } from '../src/main/storage/database'
import { prepareDataDirectory } from '../src/main/storage/data-directory'

const flash = 'deepseek-flash'
const pro = 'deepseek-v4-pro'

async function create(ai: AiConnection, presetId: string, key: string) {
  const row = (await ai.save({ presetId, key })).configurations.at(-1)
  assert.ok(row)
  return row.id
}

function setup(t: { after: (cleanup: () => void) => void }) {
  const directory = mkdtempSync(join(tmpdir(), 'dook-ai-'))
  const db = new AppDatabase(join(directory, 'test.sqlite'))
  t.after(() => {
    db.close()
    rmSync(directory, { recursive: true, force: true })
  })
  const encryption = {
    available: async () => true,
    encrypt: async (key: string) => Buffer.from(Buffer.from(key).toString('base64')),
    decrypt: async (bytes: Buffer) => Buffer.from(bytes.toString(), 'base64').toString()
  }
  const calls: { url: string; auth: string | null; body: Record<string, unknown> }[] = []
  let status = 200
  const usage = {
    prompt_tokens: 10,
    completion_tokens: 8,
    total_tokens: 18,
    prompt_cache_hit_tokens: 0,
    prompt_cache_miss_tokens: 10,
    completion_tokens_details: { reasoning_tokens: 4 }
  }
  const request: typeof fetch = async (url, init) => {
    calls.push({
      url: String(url),
      auth: new Headers(init?.headers).get('authorization'),
      body: JSON.parse(String(init?.body))
    })
    return Response.json(
      {
        choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
        usage: status === 200 ? usage : undefined
      },
      { status }
    )
  }
  return {
    directory,
    db,
    encryption,
    calls,
    usage,
    restart: (onCallLogged?: () => void) =>
      new AiConnection(
        directory,
        encryption,
        new AiCallLog(db.connection, directory),
        request,
        onCallLogged
      ),
    setStatus: (value: number) => {
      status = value
    }
  }
}

test('AI调用日志记录测试成功、失败及可用的Token用量，重启后保留最后调用时间', async (t) => {
  const { directory, db, restart, setStatus, usage } = setup(t)
  let logged = 0
  const ai = restart(() => logged++)
  const flashId = await create(ai, flash, 'private-key')
  const proId = await create(ai, pro, 'another-key')
  ai.select(proId)
  await ai.complete('daily_report', [{ role: 'user', content: '私密请求内容' }])
  await ai.test(proId)
  setStatus(429)
  await assert.rejects(ai.test(flashId), /限流/)
  assert.equal(logged, 5)

  const records = db.connection.prepare('SELECT * FROM ai_call_logs ORDER BY id').all()
  const counts = [10, 8, usage.total_tokens, 0, 10, 4]
  assert.deepEqual(
    records.map(
      ({
        configuration_id,
        event,
        outcome,
        http_status,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        prompt_cache_hit_tokens,
        prompt_cache_miss_tokens,
        reasoning_tokens
      }) => [
        configuration_id,
        event,
        outcome,
        http_status,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        prompt_cache_hit_tokens,
        prompt_cache_miss_tokens,
        reasoning_tokens
      ]
    ),
    [
      [flashId, 'verify', 'success', 200, ...counts],
      [proId, 'verify', 'success', 200, ...counts],
      [proId, 'daily_report', 'success', 200, ...counts],
      [proId, 'test', 'success', 200, ...counts],
      [flashId, 'test', 'error', 429, null, null, null, null, null, null]
    ]
  )
  assert.doesNotMatch(JSON.stringify(records), /private-key|another-key|私密请求内容|Reply OK/)
  assert.deepEqual(
    restart()
      .getSettings()
      .configurations.map(({ lastCalledAt, totalTokens }) => [lastCalledAt, totalTokens]),
    [
      [records[4].called_at, usage.total_tokens],
      [records[3].called_at, usage.total_tokens * 3]
    ]
  )
  const reopened = new AppDatabase(db.path)
  try {
    assert.equal(
      new AiCallLog(reopened.connection, directory).summarize(flashId).lastCalledAt,
      records[4].called_at
    )
  } finally {
    reopened.close()
  }
})

test('旧AI日志导入SQLite后保留事件和Token用量，重复启动不重复导入', (t) => {
  const { directory, db, usage } = setup(t)
  const calledAt = '2026-11-13T00:00:00.000Z'
  const oldEntry = JSON.stringify({
    configurationId: flash,
    model: flash,
    purpose: 'complete',
    calledAt,
    durationMs: 35,
    outcome: 'success',
    httpStatus: 200,
    usage
  })
  writeFileSync(join(directory, 'ai-calls.jsonl'), `${oldEntry}\n{\n${oldEntry}\n`)
  new AiCallLog(db.connection, directory)
  const reopened = new AiCallLog(db.connection, directory)
  assert.deepEqual(reopened.summarize(flash), {
    lastCalledAt: calledAt,
    totalTokens: usage.total_tokens * 2
  })
  assert.deepEqual(reopened.summarize(pro), { lastCalledAt: null, totalTokens: null })
  const rows = db.connection.prepare('SELECT event, total_tokens FROM ai_call_logs').all()
  assert.deepEqual(
    rows.map((row) => [row.event, row.total_tokens]),
    [
      ['complete', usage.total_tokens],
      ['complete', usage.total_tokens]
    ]
  )
})

test('AI连接可验证、独立保存和更换同Key配置，切换后正式请求和测试使用相同模型', async (t) => {
  const { directory, calls, restart } = setup(t)
  const ai = restart()
  assert.equal(ai.getSettings().activeId, null)
  assert.deepEqual(ai.getSettings().configurations, [])
  const flashId = await create(ai, flash, 'shared-key')
  const proId = await create(ai, pro, 'shared-key')
  for (const [index, model] of [flash, pro].entries()) {
    assert.equal(calls[index].body.model, model)
    assert.deepEqual(calls[index].body.thinking, { type: 'enabled' })
    assert.equal(calls[index].body.reasoning_effort, 'high')
  }
  ai.select(proId)
  assert.deepEqual(JSON.parse(readFileSync(join(directory, 'ai-settings.json'), 'utf8')), {
    activeId: proId,
    configurations: [
      { id: flashId, presetId: flash, name: 'DeepSeek V4.1 Flash', reasoning: 'high' },
      { id: proId, presetId: pro, name: 'DeepSeek V4 Pro', reasoning: 'high' }
    ]
  })

  const reopened = restart()
  await reopened.test(proId)
  await reopened.complete('daily_report', [{ role: 'user', content: '日报材料' }])
  assert.deepEqual(
    calls.slice(-2).map(({ url, auth, body }) => ({
      url,
      auth,
      model: body.model,
      thinking: body.thinking,
      effort: body.reasoning_effort
    })),
    [
      {
        url: 'https://api.deepseek.com/chat/completions',
        auth: 'Bearer shared-key',
        model: pro,
        thinking: { type: 'enabled' },
        effort: 'high'
      },
      {
        url: 'https://api.deepseek.com/chat/completions',
        auth: 'Bearer shared-key',
        model: pro,
        thinking: { type: 'enabled' },
        effort: 'high'
      }
    ]
  )
  assert.deepEqual(calls.at(-2)?.body.messages, [{ role: 'user', content: 'Reply OK.' }])
  await reopened.save({ id: flashId, key: 'new-key' })
  await reopened.test(proId)
  assert.equal(calls.at(-1)?.auth, 'Bearer shared-key')
  await reopened.save({ id: proId, key: 'new-pro-key' })
  await reopened.test(proId)
  assert.equal(calls.at(-1)?.auth, 'Bearer new-pro-key')
  reopened.remove(proId)
  assert.equal(restart().getSettings().activeId, flashId)
  await reopened.test(flashId)
  assert.equal(calls.at(-1)?.auth, 'Bearer new-key')
  reopened.remove(flashId)
  assert.deepEqual(restart().getSettings().configurations, [])
})

test('旧DeepSeek Key可作为Flash使用，移除后重启不会恢复', async (t) => {
  const { directory, encryption, calls, restart } = setup(t)
  writeFileSync(join(directory, 'deepseek-key'), await encryption.encrypt('legacy-key'))
  const ai = restart()
  assert.deepEqual(
    ai.getSettings().configurations.map(({ id }) => id),
    [flash]
  )
  await ai.test(flash)
  assert.equal(calls.at(-1)?.auth, 'Bearer legacy-key')
  ai.remove(flash)
  assert.deepEqual(restart().getSettings().configurations, [])
})

test('无效Key和服务失败不会覆盖旧凭证或添加配置', async (t) => {
  const { restart, calls, setStatus } = setup(t)
  const ai = restart()
  const id = await create(ai, flash, 'valid-key')
  for (const [status, message] of [
    [401, /鉴权失败/],
    [402, /余额不足/],
    [429, /限流/],
    [503, /服务请求失败/]
  ] as const) {
    setStatus(status)
    await assert.rejects(ai.save({ id, key: 'rejected-key' }), message)
    await assert.rejects(ai.save({ presetId: pro, key: 'rejected-key' }), message)
    assert.deepEqual(
      ai.getSettings().configurations.map((row) => row.id),
      [id]
    )
  }
  setStatus(200)
  await restart().test(id)
  assert.equal(calls.at(-1)?.auth, 'Bearer valid-key')
})

test('系统加密不可用时拒绝保存凭证', async (t) => {
  const { restart, encryption } = setup(t)
  encryption.available = async () => false
  const ai = restart()
  await assert.rejects(ai.save({ presetId: flash, key: 'unsaved-key' }), /系统加密不可用/)
  assert.deepEqual(ai.getSettings().configurations, [])
})

test('首次选择新安装数据目录时沿用旧目录的DeepSeek Key', async (t) => {
  const { directory, encryption, calls, restart } = setup(t)
  const formerDirectory = join(directory, 'former')
  mkdirSync(formerDirectory)
  writeFileSync(join(formerDirectory, 'deepseek-key'), await encryption.encrypt('legacy-key'))
  await prepareDataDirectory(directory, join(directory, 'previous'), formerDirectory)
  await restart().test(flash)
  assert.equal(calls.at(-1)?.auth, 'Bearer legacy-key')
})

test('移除配置时元数据写入失败，重启仍可使用原Key', async (t) => {
  const { directory, calls, restart } = setup(t)
  const ai = restart()
  const id = await create(ai, flash, 'original-key')
  const blockedPath = join(directory, 'ai-settings.json.tmp')
  mkdirSync(blockedPath)
  assert.throws(() => ai.remove(id), /无法移除AI配置/)
  await restart().test(id)
  assert.equal(calls.at(-1)?.auth, 'Bearer original-key')
})

test('配置名称可独立修改并在重启后保留，名称和Key验证失败时保留原配置', async (t) => {
  const { calls, restart, setStatus } = setup(t)
  const ai = restart()
  const { configurations } = await ai.save({
    presetId: flash,
    key: 'original-key',
    name: '工作日报'
  })
  const [{ id }] = configurations
  const reopened = restart()
  assert.equal(reopened.getSettings().configurations[0].name, '工作日报')
  await reopened.save({ id, name: '快速整理' })
  assert.equal(calls.length, 1)
  setStatus(401)
  await assert.rejects(reopened.save({ id, key: 'invalid-key', name: '无效配置' }), /鉴权失败/)
  assert.equal(restart().getSettings().configurations[0].name, '快速整理')
  setStatus(200)
  await reopened.test(id)
  assert.equal(calls.at(-1)?.auth, 'Bearer original-key')
  assert.equal(calls.at(-1)?.body.model, flash)
  reopened.remove(id)
  assert.deepEqual(restart().getSettings().configurations, [])
})

test('同一模型的多账号配置各自保存Key、名称和推理强度', async (t) => {
  const { restart, calls } = setup(t)
  const ai = restart()
  const firstId = await create(ai, flash, 'first-key')
  const { configurations } = await ai.save({
    presetId: flash,
    key: 'second-key',
    name: '工作账号',
    reasoning: 'low'
  })
  const secondId = configurations[1].id
  assert.notEqual(firstId, secondId)
  assert.equal(calls.at(-1)?.body.reasoning_effort, 'low')
  ai.select(secondId)
  const reopened = restart()
  await reopened.test(secondId)
  await reopened.complete('daily_report', [{ role: 'user', content: '日报材料' }])
  assert.deepEqual(
    calls.slice(-2).map(({ auth, body }) => [auth, body.model, body.reasoning_effort]),
    [
      ['Bearer second-key', flash, 'low'],
      ['Bearer second-key', flash, 'low']
    ]
  )
  await reopened.save({ id: secondId, reasoning: 'off' })
  await reopened.test(secondId)
  assert.deepEqual(calls.at(-1)?.body.thinking, { type: 'disabled' })
  reopened.remove(secondId)
  await restart().test(firstId)
  assert.equal(calls.at(-1)?.auth, 'Bearer first-key')
  assert.equal(calls.at(-1)?.body.reasoning_effort, 'high')
})

test('旧JSON的默认项、自定义名称和Key迁移到配置记录', async (t) => {
  const { directory, encryption, restart, calls } = setup(t)
  const path = join(directory, 'ai-settings.json')
  writeFileSync(
    path,
    JSON.stringify({
      activeId: flash,
      configuredIds: [flash],
      names: { [flash]: '旧账号' }
    })
  )
  writeFileSync(join(directory, `ai-${flash}.key`), await encryption.encrypt('legacy-key'))
  const ai = restart()
  assert.equal(ai.getSettings().configurations[0].name, '旧账号')
  await ai.save({ id: flash, reasoning: 'max' })
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), {
    activeId: flash,
    configurations: [{ id: flash, presetId: flash, name: '旧账号', reasoning: 'max' }]
  })
  await restart().test(flash)
  assert.equal(calls.at(-1)?.auth, 'Bearer legacy-key')
  assert.equal(calls.at(-1)?.body.reasoning_effort, 'max')
})

test('创建和改名时检查显示名称重复，重复提交不会验证Key', async (t) => {
  const { directory, restart, calls } = setup(t)
  const ai = restart()
  const flashId = await create(ai, flash, 'flash-key')
  assert.deepEqual(
    JSON.parse(readFileSync(join(directory, 'ai-settings.json'), 'utf8')).configurations[0],
    { id: flashId, presetId: flash, name: 'DeepSeek V4.1 Flash', reasoning: 'high' }
  )
  const duplicate = /配置名称已存在/
  await assert.rejects(ai.save({ presetId: flash, key: 'duplicate-key' }), duplicate)
  await assert.rejects(
    ai.save({ presetId: pro, key: 'duplicate-key', name: '  DEEPSEEK V4.1 FLASH  ' }),
    duplicate
  )
  const proId = await create(ai, pro, 'pro-key')
  await assert.rejects(
    ai.save({ id: proId, key: 'duplicate-key', name: ' DEEPSEEK V4.1 FLASH ' }),
    duplicate
  )
  await ai.save({ id: flashId, name: 'DeepSeek Flash', reasoning: 'max' })
  assert.equal(calls.length, 2)
  assert.equal(restart().getSettings().configurations[0].reasoning, 'max')
})

test('缺少名称或沿用预设ID的名称读取时补全为预设显示名，保存时写回', async (t) => {
  const { directory, encryption, restart } = setup(t)
  const path = join(directory, 'ai-settings.json')
  writeFileSync(
    path,
    JSON.stringify({
      activeId: flash,
      configurations: [
        { id: flash, presetId: flash, reasoning: 'low' },
        { id: pro, presetId: pro, name: 'deepseek-v4-pro', reasoning: 'high' }
      ]
    })
  )
  writeFileSync(join(directory, `ai-${flash}.key`), await encryption.encrypt('legacy-key'))
  const ai = restart()
  assert.deepEqual(
    ai.getSettings().configurations.map(({ name }) => name),
    ['DeepSeek V4.1 Flash', 'DeepSeek V4 Pro']
  )
  await ai.save({ id: flash, reasoning: 'max' })
  const stored = JSON.parse(readFileSync(path, 'utf8')).configurations
  assert.deepEqual(stored[0], {
    id: flash,
    presetId: flash,
    name: 'DeepSeek V4.1 Flash',
    reasoning: 'max'
  })
  assert.equal(stored[1].name, 'DeepSeek V4 Pro')
})

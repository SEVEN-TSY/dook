import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { AiConnection } from '../src/main/ai/connection'
import { prepareDataDirectory } from '../src/main/storage/data-directory'

const flash = 'deepseek-flash'
const pro = 'deepseek-v4-pro'

function setup(t: { after: (cleanup: () => void) => void }) {
  const directory = mkdtempSync(join(tmpdir(), 'dook-ai-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const encryption = {
    available: async () => true,
    encrypt: async (key: string) => Buffer.from(Buffer.from(key).toString('base64')),
    decrypt: async (bytes: Buffer) => Buffer.from(bytes.toString(), 'base64').toString()
  }
  const calls: { url: string; auth: string | null; body: Record<string, unknown> }[] = []
  let status = 200
  const request: typeof fetch = async (url, init) => {
    calls.push({
      url: String(url),
      auth: new Headers(init?.headers).get('authorization'),
      body: JSON.parse(String(init?.body))
    })
    return Response.json(
      { choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] },
      { status }
    )
  }
  return {
    directory,
    encryption,
    calls,
    restart: () => new AiConnection(directory, encryption, request),
    setStatus: (value: number) => {
      status = value
    }
  }
}

test('AI连接可验证、独立保存和更换同Key配置，切换后正式请求和测试使用相同模型', async (t) => {
  const { directory, calls, restart } = setup(t)
  const ai = restart()
  assert.equal(ai.getSettings().activeId, flash)
  assert.deepEqual(ai.getSettings().configuredIds, [])
  await ai.save(flash, 'shared-key')
  await ai.save(pro, 'shared-key')
  for (const [index, model] of [flash, pro].entries()) {
    assert.equal(calls[index].body.model, model)
    assert.deepEqual(calls[index].body.thinking, { type: 'disabled' })
    assert.equal(calls[index].body.reasoning_effort, undefined)
  }
  ai.select(pro)
  assert.deepEqual(JSON.parse(readFileSync(join(directory, 'ai-settings.json'), 'utf8')), {
    activeId: pro,
    configuredIds: [flash, pro]
  })

  const reopened = restart()
  await reopened.test(pro)
  await reopened.complete([{ role: 'user', content: '日报材料' }])
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
        thinking: { type: 'disabled' },
        effort: undefined
      },
      {
        url: 'https://api.deepseek.com/chat/completions',
        auth: 'Bearer shared-key',
        model: pro,
        thinking: { type: 'disabled' },
        effort: undefined
      }
    ]
  )
  assert.deepEqual(calls.at(-2)?.body.messages, [{ role: 'user', content: 'Reply OK.' }])
  await reopened.save(flash, 'new-key')
  await reopened.test(pro)
  assert.equal(calls.at(-1)?.auth, 'Bearer shared-key')
  await reopened.save(pro, 'new-pro-key')
  await reopened.test(pro)
  assert.equal(calls.at(-1)?.auth, 'Bearer new-pro-key')
  reopened.remove(pro)
  assert.equal(restart().getSettings().activeId, flash)
  await reopened.test(flash)
  assert.equal(calls.at(-1)?.auth, 'Bearer new-key')
  reopened.remove(flash)
  assert.deepEqual(restart().getSettings().configuredIds, [])
})

test('旧DeepSeek Key可作为Flash使用，移除后重启不会恢复', async (t) => {
  const { directory, encryption, calls, restart } = setup(t)
  writeFileSync(join(directory, 'deepseek-key'), await encryption.encrypt('legacy-key'))
  const ai = restart()
  assert.deepEqual(ai.getSettings().configuredIds, [flash])
  await ai.test(flash)
  assert.equal(calls.at(-1)?.auth, 'Bearer legacy-key')
  ai.remove(flash)
  assert.deepEqual(restart().getSettings().configuredIds, [])
})

test('无效Key和服务失败不会覆盖旧凭证或添加配置', async (t) => {
  const { restart, calls, setStatus } = setup(t)
  const ai = restart()
  await ai.save(flash, 'valid-key')
  for (const [status, message] of [
    [401, /鉴权失败/],
    [402, /余额不足/],
    [429, /限流/],
    [503, /服务请求失败/]
  ] as const) {
    setStatus(status)
    await assert.rejects(ai.save(flash, 'rejected-key'), message)
    await assert.rejects(ai.save(pro, 'rejected-key'), message)
    assert.deepEqual(ai.getSettings().configuredIds, [flash])
  }
  setStatus(200)
  await restart().test(flash)
  assert.equal(calls.at(-1)?.auth, 'Bearer valid-key')
})

test('系统加密不可用时拒绝保存凭证', async (t) => {
  const { restart, encryption } = setup(t)
  encryption.available = async () => false
  const ai = restart()
  await assert.rejects(ai.save(flash, 'unsaved-key'), /系统加密不可用/)
  assert.deepEqual(ai.getSettings().configuredIds, [])
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
  await ai.save(flash, 'original-key')
  const blockedPath = join(directory, 'ai-settings.json.tmp')
  mkdirSync(blockedPath)
  assert.throws(() => ai.remove(flash), /无法移除AI配置/)
  await restart().test(flash)
  assert.equal(calls.at(-1)?.auth, 'Bearer original-key')
})

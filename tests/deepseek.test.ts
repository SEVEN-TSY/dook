import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DeepSeekConnection } from '../src/main/deepseek/connection'

test('tests the saved DeepSeek Key with a fixed request and supports replacement and clearing', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'dook-deepseek-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const path = join(directory, 'key')
  let available = true
  const encryption = {
    available: async () => available,
    encrypt: async (key: string) => Buffer.from(key).reverse(),
    decrypt: async (bytes: Buffer) => Buffer.from(bytes).reverse().toString()
  }
  let status = 200
  let networkFailure = false
  const request: typeof fetch = async (url, options) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions')
    assert.deepEqual(JSON.parse(String(options?.body)), {
      model: 'deepseek-flash',
      messages: [{ role: 'user', content: 'Reply OK.' }],
      thinking: { type: 'disabled' },
      stream: false,
      max_tokens: 8
    })
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer saved-key')
    if (networkFailure) throw new Error('saved-key')
    return new Response(
      JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'OK' } }] }),
      { status }
    )
  }
  const first = new DeepSeekConnection(path, encryption, request)
  assert.equal(first.isConfigured(), false)
  await first.save('old-key')
  await first.save(' saved-key ')
  const restarted = new DeepSeekConnection(path, encryption, request)
  assert.equal(restarted.isConfigured(), true)
  available = false
  await assert.rejects(restarted.save('new-key'), /系统加密/)
  available = true
  await restarted.test()
  for (const [code, message] of [
    [401, /鉴权/],
    [402, /余额/],
    [429, /限流/],
    [503, /服务/]
  ] as const) {
    status = code
    await assert.rejects(restarted.test(), message)
  }
  networkFailure = true
  await assert.rejects(restarted.test(), { message: '无法连接DeepSeek，请检查网络。' })
  const save = restarted.save('pending-key')
  await restarted.clear()
  await save
  assert.equal(first.isConfigured(), false)
  await assert.rejects(first.test(), /请先配置/)
})

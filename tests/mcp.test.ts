import assert from 'node:assert/strict'
import test from 'node:test'
import { request } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { AppDatabase } from '../src/main/storage/database'
import { AppService } from '../src/main/core/app-service'
import { startMcpEndpoint } from '../src/main/mcp/server'
import { probeMcpEndpoint } from '../src/main/mcp/probe'

test('官方MCP客户端可握手、发现并调用共享核心诊断', async (t) => {
  const database = new AppDatabase(':memory:')
  const token = 'test-token'
  const endpoint = await startMcpEndpoint({ service: new AppService(database), token, port: 0 })
  const client = new Client({ name: 'test', version: '1.0.0' })
  t.after(async () => {
    await client.close()
    await endpoint.close()
    database.close()
  })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(endpoint.url), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } }
    }),
    { timeout: 5000 }
  )
  const tools = await client.listTools()
  assert.deepEqual(
    tools.tools.map((tool) => tool.name),
    ['app_diagnostics']
  )
  const result = await client.callTool({ name: 'app_diagnostics', arguments: {} })
  assert.notEqual(result.isError, true)
  assert.equal((result.structuredContent as { service: string }).service, 'mytodo-core')
  assert.match(await probeMcpEndpoint(endpoint.url, token), /握手成功/)
})

test('MCP拒绝缺失凭证、外部Origin与错误Host', async (t) => {
  const database = new AppDatabase(':memory:')
  const endpoint = await startMcpEndpoint({
    service: new AppService(database),
    token: 'test-token',
    port: 0
  })
  t.after(async () => {
    await endpoint.close()
    database.close()
  })
  const missing = await fetch(endpoint.url, { method: 'POST' })
  assert.equal(missing.status, 401)
  const external = await fetch(endpoint.url, {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token', Origin: 'https://example.com' }
  })
  assert.equal(external.status, 403)
  const invalidHostStatus = await new Promise<number | undefined>((resolve, reject) => {
    const req = request(
      endpoint.url,
      { method: 'POST', headers: { Authorization: 'Bearer test-token', Host: 'example.com' } },
      (response) => {
        response.resume()
        resolve(response.statusCode)
      }
    )
    req.on('error', reject)
    req.end()
  })
  assert.equal(invalidHostStatus, 403)
  const unsupported = await fetch(endpoint.url, { headers: { Authorization: 'Bearer test-token' } })
  assert.equal(unsupported.status, 405)
})

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { z } from 'zod'

const probeResult = z.object({
  service: z.literal('dook-core'),
  storage: z.object({ roundTrip: z.literal(true) })
})

/** 使用官方SDK走真实HTTP握手及工具调用，供测试页验证MCP链路。 */
export async function probeMcpEndpoint(endpoint: string, token: string): Promise<string> {
  const client = new Client({ name: 'dook-diagnostics', version: '0.1.0' })
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } }
  })
  try {
    await client.connect(transport, { timeout: 5000 })
    const result = await client.callTool({ name: 'app_diagnostics', arguments: {} }, undefined, {
      timeout: 5000
    })
    if (result.isError || !probeResult.safeParse(result.structuredContent).success) {
      throw new Error('MCP诊断工具未返回预期的核心服务结果。')
    }
    return 'Streamable HTTP握手成功，app_diagnostics已调用共享核心服务。'
  } finally {
    await client.close()
  }
}

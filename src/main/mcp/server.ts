import { timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { AppService } from '../core/app-service'

export interface McpEndpoint {
  url: string
  close: () => Promise<void>
}

interface McpOptions {
  service: AppService
  token: string
  port: number
}

function authorized(header: string | undefined, token: string): boolean {
  const actual = Buffer.from(header ?? '')
  const expected = Buffer.from(`Bearer ${token}`)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function createProtocolServer(service: AppService): McpServer {
  const server = new McpServer({ name: 'mytodo', version: '0.1.0' })
  server.registerTool(
    'app_diagnostics',
    {
      title: '应用基础链路诊断',
      description:
        '检查myTodo核心服务和SQLite是否可用。当前工程仅提供基础诊断，尚无任务、习惯或小记的业务读写工具。',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async () => {
      try {
        const result = service.probe()
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: { ...result }
        }
      } catch (error) {
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: error instanceof Error ? error.message : '诊断失败' }
          ]
        }
      }
    }
  )
  return server
}

/** 内嵌在Electron主进程；不启动独立的常驻后端。 */
export async function startMcpEndpoint({ service, token, port }: McpOptions): Promise<McpEndpoint> {
  let activePort = port
  const httpServer: Server = createServer(async (req, res) => {
    const origin = `http://127.0.0.1:${activePort}`
    if (
      req.headers.host !== `127.0.0.1:${activePort}` ||
      (req.headers.origin !== undefined && req.headers.origin !== origin)
    ) {
      res.writeHead(403).end('Forbidden host or origin')
      return
    }
    if (!authorized(req.headers.authorization, token)) {
      res
        .writeHead(401, { 'WWW-Authenticate': 'Bearer', 'Cache-Control': 'no-store' })
        .end('Unauthorized')
      return
    }
    if (req.url?.split('?')[0] !== '/mcp') {
      res.writeHead(404).end('Not found')
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' }).end('Method not allowed')
      return
    }

    // 无会话、JSON响应：每次请求单独创建协议对象，共享同一业务服务。
    const server = createProtocolServer(service)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    })
    res.once('close', () => {
      void transport.close().catch(() => {})
      void server.close().catch(() => {})
    })
    try {
      await server.connect(transport)
      await transport.handleRequest(req, res)
    } catch {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32603, message: 'MCP request failed' }
          })
        )
      } else if (!res.writableEnded) {
        res.end()
      }
    }
  })
  httpServer.requestTimeout = 10_000
  httpServer.headersTimeout = 5_000

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(port, '127.0.0.1', () => {
      httpServer.removeListener('error', reject)
      resolve()
    })
  })
  const address = httpServer.address()
  if (!address || typeof address === 'string') throw new Error('无法取得MCP监听端口。')
  activePort = address.port

  return {
    url: `http://127.0.0.1:${activePort}/mcp`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()))
        httpServer.closeAllConnections()
      })
  }
}

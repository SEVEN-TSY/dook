import { performance } from 'node:perf_hooks'
import type { DiagnosticCheck, DiagnosticReport, McpStatus } from '../../shared/contracts'
import type { AppService } from '../core/app-service'
import { probeMcpEndpoint } from '../mcp/probe'

export async function runDiagnostics(
  service: AppService,
  mcp: McpStatus,
  token: string
): Promise<DiagnosticReport> {
  const checks: DiagnosticCheck[] = []
  const measure = async (
    id: DiagnosticCheck['id'],
    title: string,
    run: () => string | Promise<string>
  ) => {
    const start = performance.now()
    try {
      checks.push({
        id,
        title,
        ok: true,
        detail: await run(),
        durationMs: Math.round(performance.now() - start)
      })
    } catch (error) {
      checks.push({
        id,
        title,
        ok: false,
        detail: error instanceof Error ? error.message : '检查失败',
        durationMs: Math.round(performance.now() - start)
      })
    }
  }
  await measure('ipc', '进程通信', () => 'React → preload → IPC → Electron主进程已连通。')
  await measure('sqlite', 'SQLite读写', () => {
    const { storage } = service.probe()
    if (!storage.roundTrip) throw new Error('SQLite临时表读写结果不一致。')
    return `SQLite ${storage.sqliteVersion} · 迁移v${storage.migrationVersion} · ${storage.journalMode.toUpperCase()} · 临时表写入与读取成功。`
  })
  await measure('mcp', 'MCP工具调用', async () => {
    if (mcp.state !== 'listening' || !mcp.endpoint)
      throw new Error(mcp.error ?? 'MCP端点尚未启动。')
    return probeMcpEndpoint(mcp.endpoint, token)
  })
  return { checkedAt: new Date().toISOString(), checks }
}

/** 只放跨进程可序列化的数据契约，不依赖Electron或Node.js。 */
export interface RuntimeInfo {
  appVersion: string
  electron: string
  chrome: string
  node: string
  platform: string
  dataDirectory: string
  isPackaged: boolean
}

export interface StorageProbe {
  sqliteVersion: string
  migrationVersion: number
  journalMode: string
  roundTrip: boolean
}

export interface CoreProbe {
  service: 'mytodo-core'
  checkedAt: string
  storage: StorageProbe
}

export interface McpStatus {
  state: 'listening' | 'unavailable'
  endpoint: string | null
  error: string | null
}

export interface BootstrapInfo {
  runtime: RuntimeInfo
  mcp: McpStatus
}

export interface DiagnosticCheck {
  id: 'ipc' | 'sqlite' | 'mcp'
  title: string
  ok: boolean
  detail: string
  durationMs: number
}

export interface DiagnosticReport {
  checkedAt: string
  checks: DiagnosticCheck[]
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** 显式白名单API；渲染进程不能调用任意IPC、SQL或Node.js接口。 */
export interface DesktopApi {
  getBootstrap: () => Promise<ApiResult<BootstrapInfo>>
  runDiagnostics: () => Promise<ApiResult<DiagnosticReport>>
}

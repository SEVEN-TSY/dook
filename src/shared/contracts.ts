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
  getWindowState: () => Promise<ApiResult<DesktopState>>
  updateSettings: (settings: WindowSettings) => Promise<ApiResult<void>>
  toggleNotePin: () => Promise<ApiResult<void>>
  hideWindow: () => Promise<ApiResult<void>>
  setInteraction: (active: boolean) => Promise<ApiResult<void>>
  onWindowState: (listener: (state: DesktopState) => void) => () => void
  onSaveRequested: (listener: () => Promise<boolean>) => () => void
  listToday: () => Promise<ApiResult<TodayTasks>>
  createTask: (description: string, expectedDate?: string) => Promise<ApiResult<Task>>
  updateTask: (id: string, description: string) => Promise<ApiResult<Task>>
  setTaskCompleted: (id: string, completed: boolean) => Promise<ApiResult<Task>>
  deleteTask: (id: string) => Promise<ApiResult<boolean>>
  openWindow: (kind: WindowKind) => Promise<ApiResult<void>>
  onTasksChanged: (listener: () => void) => () => void
  getBootstrap: () => Promise<ApiResult<BootstrapInfo>>
  runDiagnostics: () => Promise<ApiResult<DiagnosticReport>>
}

export type DockEdge = 'left' | 'right' | 'top'
export interface WindowSettings {
  defaultAlwaysOnTop: boolean
  edgeAutoHide: boolean
}
export interface DesktopState {
  settings: WindowSettings
  pinned: boolean
  edge: DockEdge | null
  collapsed: boolean
}

export type WindowKind = 'main' | 'note'

export interface Task {
  id: string
  description: string
  date: string
  completed: boolean
}

export interface TodayTasks {
  date: string
  tasks: Task[]
}

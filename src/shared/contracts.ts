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
  setNoteDragging: (active: boolean) => Promise<ApiResult<boolean>>
  finishNoteMotion: (revision: number) => Promise<ApiResult<void>>
  onWindowState: (listener: (state: DesktopState) => void) => () => void
  onSaveRequested: (listener: () => Promise<boolean>) => () => void
  listHabits: () => Promise<ApiResult<Habit[]>>
  createHabit: (description: string) => Promise<ApiResult<Habit>>
  createHabitFromTask: (taskId: string) => Promise<ApiResult<Habit>>
  updateHabit: (id: string, description: string) => Promise<ApiResult<Habit>>
  deleteHabit: (id: string) => Promise<ApiResult<boolean>>
  listToday: () => Promise<ApiResult<TodayTasks>>
  listInspirations: () => Promise<ApiResult<Inspiration[]>>
  listInspirationTopics: () => Promise<ApiResult<InspirationTopic[]>>
  createInspirationTopic: (
    name: string,
    inspirationId?: string
  ) => Promise<ApiResult<InspirationTopic>>
  deleteInspirationTopic: (id: string) => Promise<ApiResult<boolean>>
  renameInspirationTopic: (id: string, name: string) => Promise<ApiResult<void>>
  setInspirationTopic: (
    inspirationId: string,
    topicId: string,
    included: boolean
  ) => Promise<ApiResult<void>>
  listInspirationPage: (
    offset: number,
    limit: number,
    group?: InspirationGroup
  ) => Promise<ApiResult<InspirationPage>>
  createInspiration: (
    description: string,
    topicId?: string,
    creationId?: string
  ) => Promise<ApiResult<Inspiration>>
  updateInspiration: (id: string, description: string) => Promise<ApiResult<Inspiration>>
  appendInspiration: (
    id: string,
    content: string,
    additionId?: string
  ) => Promise<ApiResult<Inspiration>>
  createTask: (description: string, expectedDate?: string) => Promise<ApiResult<Task>>
  updateTask: (id: string, description: string) => Promise<ApiResult<Task>>
  setTaskPinned: (id: string, pinned: boolean) => Promise<ApiResult<Task>>
  moveTask: (id: string, targetId: string, before: boolean) => Promise<ApiResult<void>>
  setTaskCompleted: (id: string, completed: boolean) => Promise<ApiResult<Task>>
  convertToMultiDay: (id: string) => Promise<ApiResult<Task>>
  setTaskProgress: (id: string, progress: number) => Promise<ApiResult<Task>>
  addSubitem: (id: string, description: string) => Promise<ApiResult<Task>>
  updateSubitem: (id: string, subitemId: string, description: string) => Promise<ApiResult<Task>>
  setSubitemCompleted: (
    id: string,
    subitemId: string,
    completed: boolean
  ) => Promise<ApiResult<Task>>
  deleteSubitem: (id: string, subitemId: string) => Promise<ApiResult<Task>>
  skipHabitTask: (id: string) => Promise<ApiResult<void>>
  deleteTask: (id: string) => Promise<ApiResult<boolean>>
  openWindow: (kind: WindowKind, page?: MainPage) => Promise<ApiResult<void>>
  onTasksChanged: (listener: () => void) => () => void
  getBootstrap: () => Promise<ApiResult<BootstrapInfo>>
  runDiagnostics: () => Promise<ApiResult<DiagnosticReport>>
}

export type DockEdge = 'left' | 'right' | 'top'
export interface WindowSettings {
  defaultAlwaysOnTop: boolean
  edgeAutoHide: boolean
}
export type MainPage = 'task' | 'habit' | 'inspiration' | 'settings'

export interface DesktopState {
  mainNavigation?: { page: MainPage; revision: number }
  exitPending: boolean
  settings: WindowSettings
  pinned: boolean
  edge: DockEdge | null
  collapsed: boolean
  edgeRevealed?: boolean
  edgeCapsuleVisible?: boolean
  edgeCapsulePreparing?: boolean
  noteMotion?: 'opening' | 'closing'
  noteMotionRevision?: number
  noteMotionSource?: 'capsule' | 'strip'
}

export type WindowKind = 'main' | 'note'

export interface Habit {
  id: string
  description: string
}

export interface Subitem {
  id: string
  description: string
  completed: boolean
}

export interface Task {
  id: string
  description: string
  date: string
  habitId?: string
  completed: boolean
  pinned?: boolean
  kind: 'today' | 'multi-day'
  progress: number
  completedOn: string | null
  subitems?: Subitem[]
}

export interface TodayTasks {
  date: string
  tasks: Task[]
}

export interface InspirationAddition {
  id: string
  content: string
}

export type InspirationGroup =
  | { kind: 'topic'; topicId: string }
  | { kind: 'unassigned' }
  | { kind: 'date'; start: string; end: string }
  | { kind: 'history'; start: string; end: string }

export interface InspirationPage {
  items: Inspiration[]
  hasMore: boolean
}

export interface InspirationTopic {
  id: string
  name: string
}

export interface Inspiration {
  id: string
  description: string
  additions: InspirationAddition[]
  createdAt: string | null
  topicIds: string[]
}

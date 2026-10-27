export const IPC_CHANNELS = {
  getWindowState: 'desktop:state',
  updateSettings: 'desktop:settings',
  toggleNotePin: 'desktop:toggle-pin',
  hideWindow: 'desktop:hide',
  setInteraction: 'desktop:interaction',
  saveReply: 'desktop:save-reply',
  listToday: 'tasks:list-today',
  createTask: 'tasks:create',
  updateTask: 'tasks:update',
  setTaskCompleted: 'tasks:set-completed',
  deleteTask: 'tasks:delete',
  openWindow: 'app:open-window',
  getBootstrap: 'app:get-bootstrap',
  runDiagnostics: 'app:run-diagnostics'
} as const

export const TASKS_CHANGED = 'tasks:changed'
export const WINDOW_STATE = 'desktop:changed'
export const SAVE_REQUEST = 'desktop:save-request'

export const IPC_CHANNELS = {
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

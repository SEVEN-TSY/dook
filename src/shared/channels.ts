export const IPC_CHANNELS = {
  getWindowState: 'desktop:state',
  updateSettings: 'desktop:settings',
  toggleNotePin: 'desktop:toggle-pin',
  hideWindow: 'desktop:hide',
  setInteraction: 'desktop:interaction',
  setNoteDragging: 'desktop:dragging',
  saveReply: 'desktop:save-reply',
  listHabits: 'habits:list',
  createHabit: 'habits:create',
  listToday: 'tasks:list-today',
  createTask: 'tasks:create',
  updateTask: 'tasks:update',
  setTaskCompleted: 'tasks:set-completed',
  convertToMultiDay: 'tasks:convert-multi-day',
  setTaskProgress: 'tasks:set-progress',
  deleteTask: 'tasks:delete',
  openWindow: 'app:open-window',
  getBootstrap: 'app:get-bootstrap',
  runDiagnostics: 'app:run-diagnostics'
} as const

export const TASKS_CHANGED = 'tasks:changed'
export const WINDOW_STATE = 'desktop:changed'
export const SAVE_REQUEST = 'desktop:save-request'

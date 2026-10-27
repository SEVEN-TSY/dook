import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from '../shared/contracts'
import { IPC_CHANNELS, TASKS_CHANGED } from '../shared/channels'

const api: DesktopApi = {
  listToday: () => ipcRenderer.invoke(IPC_CHANNELS.listToday),
  createTask: (description) => ipcRenderer.invoke(IPC_CHANNELS.createTask, description),
  updateTask: (id, description) => ipcRenderer.invoke(IPC_CHANNELS.updateTask, id, description),
  setTaskCompleted: (id, completed) =>
    ipcRenderer.invoke(IPC_CHANNELS.setTaskCompleted, id, completed),
  deleteTask: (id) => ipcRenderer.invoke(IPC_CHANNELS.deleteTask, id),
  openWindow: (kind) => ipcRenderer.invoke(IPC_CHANNELS.openWindow, kind),
  onTasksChanged: (listener) => {
    const callback = () => listener()
    ipcRenderer.on(TASKS_CHANGED, callback)
    return () => ipcRenderer.removeListener(TASKS_CHANGED, callback)
  },
  getBootstrap: () => ipcRenderer.invoke(IPC_CHANNELS.getBootstrap),
  runDiagnostics: () => ipcRenderer.invoke(IPC_CHANNELS.runDiagnostics)
}

contextBridge.exposeInMainWorld('myTodo', api)

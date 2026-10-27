import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from '../shared/contracts'
import { IPC_CHANNELS, TASKS_CHANGED, WINDOW_STATE, SAVE_REQUEST } from '../shared/channels'
import type { DesktopState } from '../shared/contracts'

const api: DesktopApi = {
  getWindowState: () => ipcRenderer.invoke(IPC_CHANNELS.getWindowState),
  updateSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS.updateSettings, settings),
  toggleNotePin: () => ipcRenderer.invoke(IPC_CHANNELS.toggleNotePin),
  hideWindow: () => ipcRenderer.invoke(IPC_CHANNELS.hideWindow),
  setInteraction: (active) => ipcRenderer.invoke(IPC_CHANNELS.setInteraction, active),
  setNoteDragging: (active) => ipcRenderer.invoke(IPC_CHANNELS.setNoteDragging, active),
  onWindowState: (listener) => {
    const callback = (_event: Electron.IpcRendererEvent, state: DesktopState) => listener(state)
    ipcRenderer.on(WINDOW_STATE, callback)
    return () => ipcRenderer.removeListener(WINDOW_STATE, callback)
  },
  onSaveRequested: (listener) => {
    const callback = async (_event: Electron.IpcRendererEvent, id: string) => {
      let success = false
      try {
        success = await listener()
      } catch {
        /* 主进程保留窗口，让用户重试。 */
      }
      await ipcRenderer.invoke(IPC_CHANNELS.saveReply, id, success)
    }
    ipcRenderer.on(SAVE_REQUEST, callback)
    return () => ipcRenderer.removeListener(SAVE_REQUEST, callback)
  },
  listToday: () => ipcRenderer.invoke(IPC_CHANNELS.listToday),
  createTask: (description, expectedDate) =>
    ipcRenderer.invoke(IPC_CHANNELS.createTask, description, expectedDate),
  updateTask: (id, description) => ipcRenderer.invoke(IPC_CHANNELS.updateTask, id, description),
  setTaskCompleted: (id, completed) =>
    ipcRenderer.invoke(IPC_CHANNELS.setTaskCompleted, id, completed),
  convertToMultiDay: (id) => ipcRenderer.invoke(IPC_CHANNELS.convertToMultiDay, id),
  setTaskProgress: (id, progress) => ipcRenderer.invoke(IPC_CHANNELS.setTaskProgress, id, progress),
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

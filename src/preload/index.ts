import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from '../shared/contracts'
import { IPC_CHANNELS } from '../shared/channels'

const api: DesktopApi = {
  getBootstrap: () => ipcRenderer.invoke(IPC_CHANNELS.getBootstrap),
  runDiagnostics: () => ipcRenderer.invoke(IPC_CHANNELS.runDiagnostics)
}

contextBridge.exposeInMainWorld('myTodo', api)

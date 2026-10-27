import { ipcMain } from 'electron'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import type { ApiResult, BootstrapInfo, DiagnosticReport } from '../../shared/contracts'
import { IPC_CHANNELS } from '../../shared/channels'

interface Handlers {
  getBootstrap: () => BootstrapInfo
  runDiagnostics: () => Promise<DiagnosticReport>
}

export function registerIpc(window: BrowserWindow, handlers: Handlers): () => void {
  const register = <T>(channel: string, handler: () => T | Promise<T>) => {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent): Promise<ApiResult<T>> => {
      if (
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame
      ) {
        return { ok: false, error: 'IPC请求来源无效。' }
      }
      try {
        return { ok: true, data: await handler() }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : '应用调用失败。' }
      }
    })
  }
  register(IPC_CHANNELS.getBootstrap, handlers.getBootstrap)
  register(IPC_CHANNELS.runDiagnostics, handlers.runDiagnostics)
  return () => Object.values(IPC_CHANNELS).forEach((channel) => ipcMain.removeHandler(channel))
}

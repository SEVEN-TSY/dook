import { dialog, ipcMain } from 'electron'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import type { ApiResult, BootstrapInfo, DiagnosticReport, WindowKind } from '../../shared/contracts'
import { IPC_CHANNELS } from '../../shared/channels'
import type { AppService } from '../core/app-service'
import type { Desktop } from './desktop'

interface Handlers {
  desktop: Desktop
  windows: () => BrowserWindow[]
  service: AppService
  changed: () => void
  openWindow: (kind: WindowKind) => Promise<void>
  getBootstrap: () => BootstrapInfo
  runDiagnostics: () => Promise<DiagnosticReport>
}

export function registerIpc(handlers: Handlers): () => void {
  const source = (event: IpcMainInvokeEvent) =>
    handlers
      .windows()
      .find(
        (window) =>
          !window.isDestroyed() &&
          event.sender === window.webContents &&
          event.senderFrame === window.webContents.mainFrame
      )
  const register = <T>(
    channel: string,
    handler: (window: BrowserWindow, ...args: unknown[]) => T | Promise<T>
  ) => {
    ipcMain.handle(
      channel,
      async (event: IpcMainInvokeEvent, ...args: unknown[]): Promise<ApiResult<T>> => {
        const window = source(event)
        if (!window) return { ok: false, error: 'IPC请求来源无效。' }
        try {
          return { ok: true, data: await handler(window, ...args) }
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : '应用调用失败。' }
        }
      }
    )
  }
  const text = (value: unknown): string => {
    if (typeof value !== 'string') throw new Error('参数必须为文字。')
    return value
  }
  const mutate = <T>(action: () => T): T => {
    const result = action()
    handlers.changed()
    return result
  }
  register(IPC_CHANNELS.getBootstrap, handlers.getBootstrap)
  register(IPC_CHANNELS.getWindowState, () => handlers.desktop.state())
  register(IPC_CHANNELS.updateSettings, (_, settings) => {
    if (
      !settings ||
      typeof settings !== 'object' ||
      !('defaultAlwaysOnTop' in settings) ||
      !('edgeAutoHide' in settings) ||
      typeof settings.defaultAlwaysOnTop !== 'boolean' ||
      typeof settings.edgeAutoHide !== 'boolean'
    )
      throw new Error('窗口设置无效。')
    handlers.desktop.updateSettings({
      defaultAlwaysOnTop: settings.defaultAlwaysOnTop,
      edgeAutoHide: settings.edgeAutoHide
    })
  })
  register(IPC_CHANNELS.toggleNotePin, (window) => handlers.desktop.togglePin(window))
  register(IPC_CHANNELS.hideWindow, (window) => handlers.desktop.hide(window))
  register(IPC_CHANNELS.setInteraction, (window, active) => {
    if (typeof active !== 'boolean') throw new Error('交互状态无效。')
    handlers.desktop.setInteraction(window, active)
  })
  register(IPC_CHANNELS.setNoteDragging, (window, active) => {
    if (typeof active !== 'boolean') throw new Error('拖动状态无效。')
    handlers.desktop.setNoteDragging(window, active)
  })
  register(IPC_CHANNELS.saveReply, (window, id, success) => {
    if (typeof id !== 'string' || typeof success !== 'boolean') throw new Error('保存回复无效。')
    handlers.desktop.saves.reply(window, id, success)
  })
  register(IPC_CHANNELS.runDiagnostics, handlers.runDiagnostics)
  register(IPC_CHANNELS.listHabits, () => handlers.service.listHabits())
  register(IPC_CHANNELS.createHabit, (_, description) =>
    mutate(() => handlers.service.createHabit(text(description)))
  )
  register(IPC_CHANNELS.listToday, () => handlers.service.listToday())
  register(IPC_CHANNELS.listInspirations, () => handlers.service.listInspirations())
  register(IPC_CHANNELS.createInspiration, (_, description) =>
    mutate(() => handlers.service.createInspiration(text(description)))
  )
  register(IPC_CHANNELS.updateInspiration, (_, id, description) =>
    mutate(() => handlers.service.updateInspiration(text(id), text(description)))
  )
  register(IPC_CHANNELS.appendInspiration, (_, id, content, additionId) =>
    mutate(() =>
      handlers.service.appendInspiration(
        text(id),
        text(content),
        additionId === undefined ? undefined : text(additionId)
      )
    )
  )
  register(IPC_CHANNELS.createTask, (_, description, expectedDate) =>
    mutate(() =>
      handlers.service.createTask(
        text(description),
        expectedDate === undefined ? undefined : text(expectedDate)
      )
    )
  )
  register(IPC_CHANNELS.updateTask, (_, id, description) =>
    mutate(() => handlers.service.updateTask(text(id), text(description)))
  )
  register(IPC_CHANNELS.setTaskCompleted, (_, id, completed) => {
    if (typeof completed !== 'boolean') throw new Error('完成状态无效。')
    return mutate(() => handlers.service.setTaskCompleted(text(id), completed))
  })
  register(IPC_CHANNELS.deleteTask, async (window, id) => {
    const taskId = text(id)
    const task = handlers.service.listToday().tasks.find((item) => item.id === taskId)
    if (!task) throw new Error('今天任务不存在，可能已删除或日期已切换。')
    const result = await handlers.desktop.protect(() =>
      dialog.showMessageBox(window, {
        type: 'question',
        title: '删除任务',
        message: '永久删除这项任务？',
        detail: task.description,
        buttons: ['取消', '删除'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      })
    )
    if (result.response !== 1) return false
    mutate(() => handlers.service.deleteTask(taskId))
    return true
  })
  register(IPC_CHANNELS.convertToMultiDay, (_, id) =>
    mutate(() => handlers.service.convertToMultiDay(text(id)))
  )
  register(IPC_CHANNELS.setTaskProgress, (_, id, progress) => {
    if (typeof progress !== 'number') throw new Error('进度必须为数字。')
    return mutate(() => handlers.service.setTaskProgress(text(id), progress))
  })
  register(IPC_CHANNELS.openWindow, (_, kind) => {
    if (kind !== 'main' && kind !== 'note') throw new Error('窗口类型无效。')
    return handlers.openWindow(kind)
  })
  return () => Object.values(IPC_CHANNELS).forEach((channel) => ipcMain.removeHandler(channel))
}

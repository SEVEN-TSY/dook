import { dialog, ipcMain } from 'electron'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import type {
  ApiResult,
  BootstrapInfo,
  DiagnosticReport,
  MainPage,
  WindowKind
} from '../../shared/contracts'
import { IPC_CHANNELS } from '../../shared/channels'
import type { AppService } from '../core/app-service'
import type { Desktop } from './desktop'

interface Handlers {
  desktop: Desktop
  windows: () => BrowserWindow[]
  service: AppService
  changed: () => void
  openWindow: (kind: WindowKind, page?: MainPage) => Promise<void>
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
    return handlers.desktop.setNoteDragging(window, active)
  })
  register(IPC_CHANNELS.finishNoteMotion, (window, revision) => {
    if (typeof revision !== 'number' || !Number.isSafeInteger(revision))
      throw new Error('动画标识无效。')
    handlers.desktop.finishNoteMotion(window, revision)
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
  register(IPC_CHANNELS.createHabitFromTask, (_, taskId) =>
    mutate(() => handlers.service.createHabitFromTask(text(taskId)))
  )
  register(IPC_CHANNELS.updateHabit, (_, id, description) =>
    mutate(() => handlers.service.updateHabit(text(id), text(description)))
  )
  register(IPC_CHANNELS.deleteHabit, async (window, id) => {
    const habitId = text(id)
    const habit = handlers.service.listHabits().find((item) => item.id === habitId)
    if (!habit) throw new Error('习惯不存在，可能已删除。')
    const result = await handlers.desktop.protect(() =>
      dialog.showMessageBox(window, {
        type: 'question',
        title: '删除习惯',
        message: '停止这个习惯？',
        detail: `${habit.description}\n已生成的任务会保留。`,
        buttons: ['取消', '删除'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      })
    )
    if (result.response !== 1) return false
    mutate(() => handlers.service.deleteHabit(habitId))
    return true
  })
  register(IPC_CHANNELS.listToday, () => handlers.service.listToday())
  register(IPC_CHANNELS.listInspirationTopics, () => handlers.service.listInspirationTopics())
  register(IPC_CHANNELS.createInspirationTopic, (_, name, id) =>
    mutate(() =>
      handlers.service.createInspirationTopic(text(name), id === undefined ? undefined : text(id))
    )
  )
  register(IPC_CHANNELS.deleteInspirationTopic, async (window, id) => {
    const topicId = text(id)
    const topic = handlers.service.inspirationTopicDetails(topicId)
    const result = await handlers.desktop.protect(() =>
      dialog.showMessageBox(window, {
        type: 'question',
        title: '删除主题',
        message: `删除主题“${topic.name}”？`,
        detail: `关联的${topic.count}条灵感及其内容会保留。`,
        buttons: ['取消', '删除'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      })
    )
    if (result.response !== 1) return false
    mutate(() => handlers.service.deleteInspirationTopic(topicId))
    return true
  })
  register(IPC_CHANNELS.renameInspirationTopic, (_, id, name) =>
    mutate(() => handlers.service.renameInspirationTopic(text(id), text(name)))
  )
  register(IPC_CHANNELS.setInspirationTopic, (_, id, topicId, included) => {
    if (typeof included !== 'boolean') throw new Error('主题关联无效。')
    return mutate(() => handlers.service.setInspirationTopic(text(id), text(topicId), included))
  })
  register(IPC_CHANNELS.archiveInspiration, (_, id) =>
    mutate(() => handlers.service.archiveInspiration(text(id)))
  )
  register(IPC_CHANNELS.restoreInspiration, (_, id) =>
    mutate(() => handlers.service.restoreInspiration(text(id)))
  )
  register(IPC_CHANNELS.deleteArchivedInspiration, async (window, id) => {
    const ideaId = text(id)
    const result = await handlers.desktop.protect(() =>
      dialog.showMessageBox(window, {
        type: 'question',
        title: '永久删除灵感',
        message: '永久删除这条灵感？',
        detail: '灵感及其补充将被永久删除。',
        buttons: ['取消', '删除'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      })
    )
    if (result.response !== 1) return false
    mutate(() => handlers.service.deleteArchivedInspiration(ideaId))
    return true
  })
  register(IPC_CHANNELS.listInspirations, () => handlers.service.listInspirations())
  register(IPC_CHANNELS.listInspirationPage, (_, offset, limit, group) => {
    if (typeof offset !== 'number' || typeof limit !== 'number') throw new Error('分页参数无效。')
    if (group !== undefined) {
      if (!group || typeof group !== 'object' || !('kind' in group))
        throw new Error('分组参数无效。')
      const g = group as Record<string, unknown>
      if (!(
        g.kind === 'unassigned' ||
        g.kind === 'archive' ||
        (g.kind === 'topic' && typeof g.topicId === 'string' && g.topicId) ||
        ((g.kind === 'date' || g.kind === 'history') &&
          typeof g.start === 'string' &&
          typeof g.end === 'string' &&
          !Number.isNaN(Date.parse(g.start)) &&
          !Number.isNaN(Date.parse(g.end)))
      ))
        throw new Error('分组参数无效。')
    }
    return handlers.service.listInspirationPage(
      offset,
      limit,
      group as import('../../shared/contracts').InspirationGroup | undefined
    )
  })
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
  register(IPC_CHANNELS.setTaskPinned, (_, id, pinned) => {
    if (typeof pinned !== 'boolean') throw new Error('置顶状态无效。')
    return mutate(() => handlers.service.setTaskPinned(text(id), pinned))
  })
  register(IPC_CHANNELS.moveTask, (_, id, targetId, before) => {
    if (typeof before !== 'boolean') throw new Error('排序位置无效。')
    return mutate(() => handlers.service.moveTask(text(id), text(targetId), before))
  })
  register(IPC_CHANNELS.setTaskCompleted, (_, id, completed) => {
    if (typeof completed !== 'boolean') throw new Error('完成状态无效。')
    return mutate(() => handlers.service.setTaskCompleted(text(id), completed))
  })
  register(IPC_CHANNELS.addSubitem, (_, id, description) =>
    mutate(() => handlers.service.addSubitem(text(id), text(description)))
  )
  register(IPC_CHANNELS.updateSubitem, (_, id, subitemId, description) =>
    mutate(() => handlers.service.updateSubitem(text(id), text(subitemId), text(description)))
  )
  register(IPC_CHANNELS.setSubitemCompleted, (_, id, subitemId, completed) => {
    if (typeof completed !== 'boolean') throw new Error('完成状态无效。')
    return mutate(() => handlers.service.setSubitemCompleted(text(id), text(subitemId), completed))
  })
  register(IPC_CHANNELS.deleteSubitem, (_, id, subitemId) =>
    mutate(() => handlers.service.deleteSubitem(text(id), text(subitemId)))
  )
  register(IPC_CHANNELS.skipHabitTask, (_, id) =>
    mutate(() => handlers.service.skipHabitTask(text(id)))
  )
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
  register(IPC_CHANNELS.openWindow, (_, kind, page) => {
    if (kind !== 'main' && kind !== 'note') throw new Error('窗口类型无效。')
    if (
      page !== undefined &&
      (kind !== 'main' ||
        typeof page !== 'string' ||
        !['task', 'habit', 'inspiration', 'settings'].includes(page))
    )
      throw new Error('主界面页面无效。')
    return handlers.openWindow(kind, page as MainPage | undefined)
  })
  return () => Object.values(IPC_CHANNELS).forEach((channel) => ipcMain.removeHandler(channel))
}

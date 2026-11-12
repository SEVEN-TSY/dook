import { ipcMain } from 'electron'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import type {
  ApiResult,
  BootstrapInfo,
  DiagnosticReport,
  MainPage,
  WindowKind
} from '../../shared/contracts'
import { IPC_CHANNELS } from '../../shared/channels'
import { normalizeThemeColor } from '../../shared/theme-color'
import type { AppService } from '../core/app-service'
import type { Desktop } from './desktop'
import { checkForUpdates, openLatestRelease } from './updates'

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
  register(IPC_CHANNELS.checkForUpdates, () =>
    checkForUpdates(handlers.getBootstrap().runtime.appVersion)
  )
  register(IPC_CHANNELS.openLatestRelease, openLatestRelease)
  register(IPC_CHANNELS.getWindowState, () => handlers.desktop.state())
  register(IPC_CHANNELS.updateSettings, (_, settings) => {
    if (
      !settings ||
      typeof settings !== 'object' ||
      !('defaultAlwaysOnTop' in settings) ||
      !('edgeAutoHide' in settings) ||
      !('launchAtLogin' in settings) ||
      !('showMultiDay' in settings) ||
      typeof settings.showMultiDay !== 'boolean' ||
      ('locateTaskOnConvert' in settings && typeof settings.locateTaskOnConvert !== 'boolean') ||
      typeof settings.launchAtLogin !== 'boolean' ||
      typeof settings.defaultAlwaysOnTop !== 'boolean' ||
      typeof settings.edgeAutoHide !== 'boolean'
    )
      throw new Error('窗口设置无效。')
    const themeColor =
      'themeColor' in settings
        ? normalizeThemeColor(settings.themeColor)
        : handlers.desktop.state().settings.themeColor
    if (!themeColor) throw new Error('主题色必须为系统色或六位十六进制颜色。')
    const hardwareAcceleration =
      'hardwareAcceleration' in settings
        ? settings.hardwareAcceleration
        : handlers.desktop.state().settings.hardwareAcceleration
    if (typeof hardwareAcceleration !== 'boolean') throw new Error('GPU硬件加速设置无效。')
    return handlers.desktop.updateSettings({
      appearance: (() => {
        if (!('appearance' in settings)) return handlers.desktop.state().settings.appearance
        if (
          settings.appearance !== 'system' &&
          settings.appearance !== 'light' &&
          settings.appearance !== 'dark'
        )
          throw new Error('外观模式无效。')
        return settings.appearance
      })(),
      themeColor,
      launchAtLogin: settings.launchAtLogin,
      hardwareAcceleration,
      defaultAlwaysOnTop: settings.defaultAlwaysOnTop,
      edgeAutoHide: settings.edgeAutoHide,
      showMultiDay: settings.showMultiDay,
      locateTaskOnConvert:
        'locateTaskOnConvert' in settings
          ? (settings.locateTaskOnConvert as boolean)
          : handlers.desktop.state().settings.locateTaskOnConvert
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
  register(IPC_CHANNELS.finishEdgePreparation, (window, revision) => {
    if (typeof revision !== 'number' || !Number.isSafeInteger(revision))
      throw new Error('贴边交接标识无效。')
    handlers.desktop.finishEdgePreparation(window, revision)
  })
  register(IPC_CHANNELS.saveReply, (window, id, success) => {
    if (typeof id !== 'string' || typeof success !== 'boolean') throw new Error('保存回复无效。')
    handlers.desktop.saves.reply(window, id, success)
  })
  register(IPC_CHANNELS.runDiagnostics, handlers.runDiagnostics)
  register(IPC_CHANNELS.listHabits, () => handlers.service.listHabitOverview())
  register(IPC_CHANNELS.listArchivedHabits, () => handlers.service.listArchivedHabits())
  register(IPC_CHANNELS.archiveHabit, (_, id) =>
    mutate(() => handlers.service.archiveHabit(text(id)))
  )
  register(IPC_CHANNELS.restoreHabit, (_, id) =>
    mutate(() => handlers.service.restoreHabit(text(id)))
  )
  register(IPC_CHANNELS.deleteArchivedHabit, (_, id) => {
    mutate(() => handlers.service.deleteArchivedHabit(text(id)))
    return true
  })
  register(IPC_CHANNELS.createHabit, (_, description) =>
    mutate(() => handlers.service.createHabit(text(description)))
  )
  register(IPC_CHANNELS.createHabitFromTask, (_, taskId) =>
    mutate(() => handlers.service.createHabitFromTask(text(taskId)))
  )
  register(IPC_CHANNELS.setHabitSchedule, (_, id, schedule) =>
    mutate(() => handlers.service.setHabitSchedule(text(id), schedule))
  )
  register(IPC_CHANNELS.updateHabit, (_, id, description) =>
    mutate(() => handlers.service.updateHabit(text(id), text(description)))
  )
  register(IPC_CHANNELS.deleteHabit, (_, id) => {
    const habitId = text(id)
    const habit = handlers.service.listHabits().find((item) => item.id === habitId)
    if (!habit) throw new Error('习惯不存在，可能已删除。')
    mutate(() => handlers.service.deleteHabit(habitId))
    return true
  })
  register(IPC_CHANNELS.listToday, () => handlers.service.listToday())
  register(IPC_CHANNELS.listArchivedTasks, () => handlers.service.listArchivedTasks())
  register(IPC_CHANNELS.archiveTask, (_, id) =>
    mutate(() => handlers.service.archiveTask(text(id)))
  )
  register(IPC_CHANNELS.restoreTask, (_, id) =>
    mutate(() => handlers.service.restoreTask(text(id)))
  )
  register(IPC_CHANNELS.deleteArchivedTask, (_, id) => {
    const taskId = text(id)
    const task = handlers.service.listArchivedTasks().find((item) => item.id === taskId)
    if (!task) throw new Error('归档任务不存在，可能已恢复或删除。')
    mutate(() => handlers.service.deleteArchivedTask(taskId))
    return true
  })
  register(IPC_CHANNELS.listInspirationTopics, () => handlers.service.listInspirationTopics())
  register(IPC_CHANNELS.inspirationTopicDetails, (_, id) =>
    handlers.service.inspirationTopicDetails(text(id))
  )
  register(IPC_CHANNELS.createInspirationTopic, (_, name, id) =>
    mutate(() =>
      handlers.service.createInspirationTopic(text(name), id === undefined ? undefined : text(id))
    )
  )
  register(IPC_CHANNELS.deleteInspirationTopic, (_, id) => {
    const topicId = text(id)
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
  register(IPC_CHANNELS.deleteArchivedInspiration, (_, id) => {
    const ideaId = text(id)
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
  register(IPC_CHANNELS.createInspiration, (_, description, topicId, creationId) =>
    mutate(() =>
      handlers.service.createInspiration(
        text(description),
        topicId === undefined ? undefined : text(topicId),
        creationId === undefined ? undefined : text(creationId)
      )
    )
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
  register(IPC_CHANNELS.moveSubitem, (_, id, subitemId, targetId, before) =>
    mutate(() =>
      handlers.service.moveSubitem(text(id), text(subitemId), text(targetId), before as boolean)
    )
  )
  register(IPC_CHANNELS.deleteSubitem, (_, id, subitemId) =>
    mutate(() => handlers.service.deleteSubitem(text(id), text(subitemId)))
  )
  register(IPC_CHANNELS.skipHabitTask, (_, id) =>
    mutate(() => handlers.service.skipHabitTask(text(id)))
  )
  register(IPC_CHANNELS.deleteTask, (_, id) => {
    const taskId = text(id)
    const task = handlers.service.listToday().tasks.find((item) => item.id === taskId)
    if (!task) throw new Error('今天任务不存在，可能已删除或日期已切换。')
    mutate(() => handlers.service.deleteTask(taskId))
    return true
  })
  register(IPC_CHANNELS.convertToToday, (_, id, discardSubitems) =>
    mutate(() => {
      if (!handlers.desktop.state().settings.showMultiDay) throw new Error('请先开启显示持续推进。')
      if (typeof discardSubitems !== 'boolean') throw new Error('确认状态无效。')
      return handlers.service.convertToToday(text(id), discardSubitems)
    })
  )
  register(IPC_CHANNELS.convertToMultiDay, (_, id) =>
    mutate(() => {
      if (!handlers.desktop.state().settings.showMultiDay) throw new Error('请先开启显示持续推进。')
      return handlers.service.convertToMultiDay(text(id))
    })
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

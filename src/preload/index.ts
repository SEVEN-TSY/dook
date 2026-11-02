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
  finishNoteMotion: (revision) => ipcRenderer.invoke(IPC_CHANNELS.finishNoteMotion, revision),
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
  listHabits: () => ipcRenderer.invoke(IPC_CHANNELS.listHabits),
  listArchivedHabits: () => ipcRenderer.invoke(IPC_CHANNELS.listArchivedHabits),
  archiveHabit: (id) => ipcRenderer.invoke(IPC_CHANNELS.archiveHabit, id),
  restoreHabit: (id) => ipcRenderer.invoke(IPC_CHANNELS.restoreHabit, id),
  deleteArchivedHabit: (id) => ipcRenderer.invoke(IPC_CHANNELS.deleteArchivedHabit, id),
  createHabit: (description) => ipcRenderer.invoke(IPC_CHANNELS.createHabit, description),
  createHabitFromTask: (taskId) => ipcRenderer.invoke(IPC_CHANNELS.createHabitFromTask, taskId),
  updateHabit: (id, description) => ipcRenderer.invoke(IPC_CHANNELS.updateHabit, id, description),
  deleteHabit: (id) => ipcRenderer.invoke(IPC_CHANNELS.deleteHabit, id),
  listToday: () => ipcRenderer.invoke(IPC_CHANNELS.listToday),
  listArchivedTasks: () => ipcRenderer.invoke(IPC_CHANNELS.listArchivedTasks),
  archiveTask: (id) => ipcRenderer.invoke(IPC_CHANNELS.archiveTask, id),
  restoreTask: (id) => ipcRenderer.invoke(IPC_CHANNELS.restoreTask, id),
  deleteArchivedTask: (id) => ipcRenderer.invoke(IPC_CHANNELS.deleteArchivedTask, id),
  listInspirationTopics: () => ipcRenderer.invoke(IPC_CHANNELS.listInspirationTopics),
  inspirationTopicDetails: (id) => ipcRenderer.invoke(IPC_CHANNELS.inspirationTopicDetails, id),
  createInspirationTopic: (name, id) =>
    ipcRenderer.invoke(IPC_CHANNELS.createInspirationTopic, name, id),
  deleteInspirationTopic: (id) => ipcRenderer.invoke(IPC_CHANNELS.deleteInspirationTopic, id),
  renameInspirationTopic: (id, name) =>
    ipcRenderer.invoke(IPC_CHANNELS.renameInspirationTopic, id, name),
  setInspirationTopic: (id, topicId, included) =>
    ipcRenderer.invoke(IPC_CHANNELS.setInspirationTopic, id, topicId, included),
  archiveInspiration: (id) => ipcRenderer.invoke(IPC_CHANNELS.archiveInspiration, id),
  restoreInspiration: (id) => ipcRenderer.invoke(IPC_CHANNELS.restoreInspiration, id),
  deleteArchivedInspiration: (id) => ipcRenderer.invoke(IPC_CHANNELS.deleteArchivedInspiration, id),
  listInspirations: () => ipcRenderer.invoke(IPC_CHANNELS.listInspirations),
  listInspirationPage: (offset, limit, group) =>
    ipcRenderer.invoke(IPC_CHANNELS.listInspirationPage, offset, limit, group),
  createInspiration: (description, topicId, creationId) =>
    ipcRenderer.invoke(IPC_CHANNELS.createInspiration, description, topicId, creationId),
  updateInspiration: (id, description) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateInspiration, id, description),
  appendInspiration: (id, content, additionId) =>
    ipcRenderer.invoke(IPC_CHANNELS.appendInspiration, id, content, additionId),
  createTask: (description, expectedDate) =>
    ipcRenderer.invoke(IPC_CHANNELS.createTask, description, expectedDate),
  updateTask: (id, description) => ipcRenderer.invoke(IPC_CHANNELS.updateTask, id, description),
  setTaskPinned: (id, pinned) => ipcRenderer.invoke(IPC_CHANNELS.setTaskPinned, id, pinned),
  moveTask: (id, targetId, before) =>
    ipcRenderer.invoke(IPC_CHANNELS.moveTask, id, targetId, before),
  setTaskCompleted: (id, completed) =>
    ipcRenderer.invoke(IPC_CHANNELS.setTaskCompleted, id, completed),
  convertToMultiDay: (id) => ipcRenderer.invoke(IPC_CHANNELS.convertToMultiDay, id),
  setTaskProgress: (id, progress) => ipcRenderer.invoke(IPC_CHANNELS.setTaskProgress, id, progress),
  addSubitem: (id, description) => ipcRenderer.invoke(IPC_CHANNELS.addSubitem, id, description),
  updateSubitem: (id, subitemId, description) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateSubitem, id, subitemId, description),
  setSubitemCompleted: (id, subitemId, completed) =>
    ipcRenderer.invoke(IPC_CHANNELS.setSubitemCompleted, id, subitemId, completed),
  deleteSubitem: (id, subitemId) => ipcRenderer.invoke(IPC_CHANNELS.deleteSubitem, id, subitemId),
  skipHabitTask: (id) => ipcRenderer.invoke(IPC_CHANNELS.skipHabitTask, id),
  deleteTask: (id) => ipcRenderer.invoke(IPC_CHANNELS.deleteTask, id),
  openWindow: (kind, page) => ipcRenderer.invoke(IPC_CHANNELS.openWindow, kind, page),
  onTasksChanged: (listener) => {
    const callback = () => listener()
    ipcRenderer.on(TASKS_CHANGED, callback)
    return () => ipcRenderer.removeListener(TASKS_CHANGED, callback)
  },
  getBootstrap: () => ipcRenderer.invoke(IPC_CHANNELS.getBootstrap),
  runDiagnostics: () => ipcRenderer.invoke(IPC_CHANNELS.runDiagnostics)
}

contextBridge.exposeInMainWorld('myTodo', api)

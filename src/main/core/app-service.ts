import { parseHabitSchedule } from './habit-schedule'
import type {
  CoreProbe,
  StorageProbe,
  Task,
  TodayTasks,
  Habit,
  Inspiration,
  InspirationGroup
} from '../../shared/contracts'
import { localDate } from './tasks'
import type { TaskStore } from './tasks'
import type { HabitStore } from './habits'
import { validateInspirationTopicName } from './inspirations'
import type { InspirationStore } from './inspirations'

export interface StorageDiagnostics {
  probe: () => StorageProbe
}

/** IPC与MCP共用的应用入口。 */
export class AppService {
  constructor(
    private readonly storage: StorageDiagnostics,
    private readonly tasks?: TaskStore,
    private readonly now: () => Date = () => new Date(),
    private readonly features: { habits?: HabitStore; inspirations?: InspirationStore } = {}
  ) {}

  listHabits(): Habit[] {
    return this.habitStore().list()
  }

  listHabitOverview(): Habit[] {
    return this.habitStore().list(false, this.now().toISOString())
  }

  listArchivedHabits(): Habit[] {
    return this.habitStore().list(true)
  }

  archiveHabit(id: string): void {
    const now = this.now()
    this.habitStore().archive(this.taskId(id), localDate(now), now.toISOString())
  }

  restoreHabit(id: string): void {
    const now = this.now()
    this.habitStore().restore(this.taskId(id), localDate(now), now.toISOString())
  }

  deleteArchivedHabit(id: string): void {
    this.habitStore().deleteArchived(this.taskId(id))
  }

  createHabit(description: string): Habit {
    if (typeof description !== 'string' || !description.trim())
      throw new Error('习惯描述不能为空。')
    const now = this.now()
    return this.habitStore().create(description.trim(), localDate(now), now.toISOString())
  }

  createHabitFromTask(taskId: string): Habit {
    const now = this.now()
    return this.habitStore().createFromTask(this.taskId(taskId), localDate(now), now.toISOString())
  }

  setHabitSchedule(id: string, value: unknown): Habit {
    const schedule = parseHabitSchedule(value)
    const now = this.now()
    return this.habitStore().setSchedule(
      this.taskId(id),
      schedule,
      localDate(now),
      now.toISOString()
    )
  }

  updateHabit(id: string, description: string): Habit {
    if (typeof id !== 'string' || !id) throw new Error('习惯标识无效。')
    if (typeof description !== 'string' || !description.trim())
      throw new Error('习惯描述不能为空。')
    return this.habitStore().update(id, description.trim(), localDate(this.now()))
  }

  deleteHabit(id: string): void {
    if (typeof id !== 'string' || !id) throw new Error('习惯标识无效。')
    this.habitStore().delete(id, localDate(this.now()))
  }

  ensureDailyTasks(): boolean {
    const now = this.now()
    return this.features.habits?.ensureToday(localDate(now), now.toISOString()) ?? false
  }

  private habitStore(): HabitStore {
    if (!this.features.habits) throw new Error('习惯存储不可用。')
    return this.features.habits
  }

  private taskStore(): TaskStore {
    if (!this.tasks) throw new Error('任务存储不可用。')
    return this.tasks
  }

  private inspirationStore(): InspirationStore {
    if (!this.features.inspirations) throw new Error('小记存储不可用。')
    return this.features.inspirations
  }

  listInspirationTopics() {
    return this.inspirationStore().listTopics()
  }

  createInspirationTopic(name: string, inspirationId?: string) {
    const topicName = validateInspirationTopicName(name)
    if (inspirationId !== undefined && (typeof inspirationId !== 'string' || !inspirationId))
      throw new Error('小记标识无效。')
    return this.inspirationStore().createTopic(topicName, inspirationId)
  }

  inspirationTopicDetails(id: string) {
    if (typeof id !== 'string' || !id) throw new Error('主题标识无效。')
    return this.inspirationStore().topicDetails(id)
  }

  deleteInspirationTopic(id: string) {
    this.inspirationTopicDetails(id)
    this.inspirationStore().deleteTopic(id)
  }

  renameInspirationTopic(id: string, name: string) {
    if (typeof id !== 'string' || !id) throw new Error('主题标识无效。')
    const topicName = validateInspirationTopicName(name)
    this.inspirationStore().renameTopic(id, topicName)
  }

  setInspirationTopic(inspirationId: string, topicId: string, included: boolean) {
    if (
      typeof inspirationId !== 'string' ||
      !inspirationId ||
      typeof topicId !== 'string' ||
      !topicId ||
      typeof included !== 'boolean'
    )
      throw new Error('主题关联无效。')
    this.inspirationStore().setTopic(inspirationId, topicId, included)
  }

  archiveInspiration(id: string) {
    this.inspirationStore().archive(id, this.now().toISOString())
  }
  restoreInspiration(id: string) {
    this.inspirationStore().restore(id)
  }
  deleteArchivedInspiration(id: string) {
    this.inspirationStore().deleteArchived(id)
  }

  listInspirations(): Inspiration[] {
    return this.inspirationStore().list()
  }

  listInspirationPage(offset: number, limit: number, group?: InspirationGroup) {
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new Error('分页参数无效。')
    return this.inspirationStore().page(offset, limit, group)
  }

  createInspiration(description: string, topicId?: string, creationId?: string): Inspiration {
    if (typeof description !== 'string' || !description.trim()) throw new Error('小记不能为空。')
    return this.inspirationStore().create(
      description.trim(),
      this.now().toISOString(),
      topicId,
      creationId
    )
  }

  updateInspiration(id: string, description: string): Inspiration {
    if (typeof id !== 'string' || !id) throw new Error('小记标识无效。')
    if (typeof description !== 'string' || !description.trim()) throw new Error('小记不能为空。')
    return this.inspirationStore().update(id, description.trim())
  }

  appendInspiration(id: string, content: string, additionId?: string): Inspiration {
    if (typeof id !== 'string' || !id) throw new Error('小记标识无效。')
    if (typeof content !== 'string' || !content.trim()) throw new Error('补充内容不能为空。')
    if (additionId !== undefined && (typeof additionId !== 'string' || !additionId))
      throw new Error('补充标识无效。')
    return this.inspirationStore().append(id, content.trim(), additionId)
  }

  listToday(): TodayTasks {
    const date = localDate(this.now())
    return { date, tasks: this.taskStore().list(date) }
  }

  listArchivedTasks(): Task[] {
    return this.taskStore().listArchived()
  }

  archiveTask(id: string): void {
    const now = this.now()
    const date = localDate(now)
    const store = this.taskStore()
    const task = store.get(this.taskId(id), date)
    if (task.habitId) throw new Error('习惯任务请使用暂停一次。')
    store.archive(task.id, date, now.toISOString())
  }

  restoreTask(id: string): Task {
    return this.taskStore().restore(this.taskId(id), localDate(this.now()))
  }

  deleteArchivedTask(id: string): void {
    this.taskStore().deleteArchived(this.taskId(id))
  }

  createTask(description: string, expectedDate?: string): Task {
    if (typeof description !== 'string' || !description.trim())
      throw new Error('任务描述不能为空。')
    const now = this.now()
    const date = localDate(now)
    if (expectedDate !== undefined && expectedDate !== date)
      throw new Error('日期已切换，请重新记录今天任务。未保存的输入仍保留。')
    return this.taskStore().create(description.trim(), date, now.toISOString())
  }

  updateTask(id: string, description: string): Task {
    if (typeof description !== 'string' || !description.trim())
      throw new Error('任务描述不能为空。')
    const date = localDate(this.now())
    const task = this.taskStore().get(this.taskId(id), date)
    if (task.habitId) throw new Error('请在主界面的习惯中修改描述。')
    return this.taskStore().update(task.id, date, { description: description.trim() })
  }

  setTaskCompleted(id: string, completed: boolean): Task {
    if (typeof completed !== 'boolean') throw new Error('完成状态无效。')
    const date = localDate(this.now())
    const task = this.taskStore().get(this.taskId(id), date)
    if (task.subitems?.length) {
      return this.taskStore().transaction(() => {
        this.taskStore().setSubitemsCompleted(task.id, completed)
        return this.syncSubitemProgress(task.id, date)
      })
    }
    if (task.kind === 'multi-day') return this.setTaskProgress(task.id, completed ? 100 : 0)
    return this.taskStore().update(task.id, date, { completed })
  }

  skipHabitTask(id: string): void {
    const date = localDate(this.now())
    const store = this.taskStore()
    store.transaction(() => {
      const task = store.get(this.taskId(id), date)
      if (!task.habitId || task.kind !== 'today' || task.date !== date)
        throw new Error('只能暂停今天的习惯任务。')
      store.skip(task.id, date)
    })
  }

  deleteTask(id: string): void {
    this.taskStore().delete(this.taskId(id), localDate(this.now()))
  }

  convertToMultiDay(id: string): Task {
    const date = localDate(this.now())
    const task = this.taskStore().get(this.taskId(id), date)
    if (task.habitId) throw new Error('习惯任务不能转为多天任务。')
    if (task.kind === 'multi-day') return task
    return this.taskStore().update(task.id, date, {
      kind: 'multi-day',
      progress: task.completed ? 100 : 0,
      completedOn: task.completed ? date : null
    })
  }

  convertToToday(id: string, discardSubitems = false): Task {
    const date = localDate(this.now())
    const store = this.taskStore()
    return store.transaction(() => {
      const task = store.get(this.taskId(id), date)
      if (task.habitId) throw new Error('习惯任务不能转回当天任务。')
      if (task.subitems?.length && !discardSubitems)
        throw new Error('转回当天任务会丢失所有子事项，请先确认。')
      for (const item of task.subitems ?? []) store.deleteSubitem(task.id, item.id)
      return store.update(task.id, date, {
        kind: 'today',
        date,
        progress: task.completed ? 100 : 0,
        completedOn: task.completed ? date : null
      })
    })
  }

  addSubitem(id: string, description: string): Task {
    if (typeof description !== 'string' || !description.trim())
      throw new Error('子事项内容不能为空。')
    const date = localDate(this.now())
    const store = this.taskStore()
    return store.transaction(() => {
      const task = store.get(this.taskId(id), date)
      if (task.kind === 'today') this.convertToMultiDay(task.id)
      store.addSubitem(task.id, description.trim())
      store.update(task.id, date, { updatedAt: this.now().toISOString() })
      return this.syncSubitemProgress(task.id, date)
    })
  }

  updateSubitem(id: string, subitemId: string, description: string): Task {
    if (typeof description !== 'string' || !description.trim())
      throw new Error('子事项内容不能为空。')
    return this.mutateSubitem(id, () =>
      this.taskStore().updateSubitem(id, this.taskId(subitemId), {
        description: description.trim()
      })
    )
  }

  setSubitemCompleted(id: string, subitemId: string, completed: boolean): Task {
    if (typeof completed !== 'boolean') throw new Error('完成状态无效。')
    return this.mutateSubitem(id, () =>
      this.taskStore().updateSubitem(id, this.taskId(subitemId), { completed })
    )
  }

  moveSubitem(id: string, subitemId: string, targetId: string, before: boolean): Task {
    if (typeof before !== 'boolean') throw new Error('排序位置无效。')
    const store = this.taskStore()
    const date = localDate(this.now())
    return store.transaction(() => {
      const task = store.get(this.taskId(id), date)
      const items = task.subitems ?? []
      const source = items.find((item) => item.id === this.taskId(subitemId))
      if (!source || !items.some((item) => item.id === this.taskId(targetId)))
        throw new Error('请在同一任务的子事项之间调整顺序。')
      if (subitemId === targetId) return task
      const ordered = items.filter((item) => item.id !== subitemId)
      ordered.splice(
        ordered.findIndex((item) => item.id === targetId) + (before ? 0 : 1),
        0,
        source
      )
      store.setSubitemOrder(
        task.id,
        ordered.map((item) => item.id)
      )
      return store.get(task.id, date)
    })
  }

  deleteSubitem(id: string, subitemId: string): Task {
    return this.mutateSubitem(id, () => this.taskStore().deleteSubitem(id, this.taskId(subitemId)))
  }

  private mutateSubitem(id: string, action: () => void): Task {
    const date = localDate(this.now())
    return this.taskStore().transaction(() => {
      this.taskStore().get(this.taskId(id), date)
      action()
      return this.syncSubitemProgress(id, date)
    })
  }

  private syncSubitemProgress(id: string, date: string): Task {
    const store = this.taskStore()
    const task = store.get(id, date)
    const subitems = task.subitems ?? []
    if (!subitems.length) return task
    const completedCount = subitems.filter((item) => item.completed).length
    const progress = Math.floor((completedCount * 100) / subitems.length)
    return store.update(id, date, {
      progress,
      completed: completedCount === subitems.length,
      completedOn: completedCount === subitems.length ? (task.completedOn ?? date) : null
    })
  }

  setTaskPinned(id: string, pinned: boolean): Task {
    if (typeof pinned !== 'boolean') throw new Error('置顶状态无效。')
    const date = localDate(this.now())
    const store = this.taskStore()
    return store.transaction(() => {
      const task = store.update(this.taskId(id), date, { pinned })
      const group = store.list(date).filter((item) => item.kind === task.kind)
      // 新置顶的任务放到分类最前，取消置顶后放到普通任务最前。
      const peers = group.filter((item) => item.id !== id)
      const boundary = pinned ? 0 : peers.filter((item) => item.pinned).length
      peers.splice(boundary, 0, task)
      store.setOrder(peers.map((item) => item.id))
      return task
    })
  }

  moveTask(id: string, targetId: string, before: boolean): void {
    if (typeof before !== 'boolean') throw new Error('排序位置无效。')
    const date = localDate(this.now())
    const store = this.taskStore()
    store.transaction(() => {
      const task = store.get(this.taskId(id), date)
      const target = store.get(this.taskId(targetId), date)
      if (task.kind !== target.kind || Boolean(task.pinned) !== Boolean(target.pinned))
        throw new Error('请在同一分类的置顶或普通任务之间调整顺序。')
      if (id === targetId) return
      const group = store.list(date).filter((item) => item.kind === task.kind && item.id !== id)
      group.splice(group.findIndex((item) => item.id === targetId) + (before ? 0 : 1), 0, task)
      store.setOrder(group.map((item) => item.id))
    })
  }

  setTaskProgress(id: string, progress: number): Task {
    if (!Number.isInteger(progress) || progress < 0 || progress > 100)
      throw new Error('进度必须为0至100的整数。')
    const date = localDate(this.now())
    const task = this.taskStore().get(this.taskId(id), date)
    if (task.kind !== 'multi-day') throw new Error('今天任务无需设置进度。')
    if (task.subitems?.length) throw new Error('有子事项的任务进度由完成比例计算。')
    return this.taskStore().update(task.id, date, {
      progress,
      completed: progress === 100,
      completedOn: progress === 100 ? (task.completedOn ?? date) : null
    })
  }

  private taskId(id: string): string {
    if (typeof id !== 'string' || !id) throw new Error('任务标识无效。')
    return id
  }

  probe(): CoreProbe {
    return {
      service: 'dook-core',
      checkedAt: new Date().toISOString(),
      storage: this.storage.probe()
    }
  }
}

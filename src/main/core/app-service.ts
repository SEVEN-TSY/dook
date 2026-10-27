import type {
  CoreProbe,
  StorageProbe,
  Task,
  TodayTasks,
  Habit,
  Inspiration
} from '../../shared/contracts'
import { localDate } from './tasks'
import type { TaskStore } from './tasks'
import type { HabitStore } from './habits'
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

  createHabit(description: string): Habit {
    if (typeof description !== 'string' || !description.trim())
      throw new Error('习惯描述不能为空。')
    return this.habitStore().create(description.trim(), localDate(this.now()))
  }

  createHabitFromTask(taskId: string): Habit {
    return this.habitStore().createFromTask(this.taskId(taskId), localDate(this.now()))
  }

  updateHabit(id: string, description: string): Habit {
    if (typeof id !== 'string' || !id) throw new Error('习惯标识无效。')
    if (typeof description !== 'string' || !description.trim())
      throw new Error('习惯描述不能为空。')
    return this.habitStore().update(id, description.trim())
  }

  deleteHabit(id: string): void {
    if (typeof id !== 'string' || !id) throw new Error('习惯标识无效。')
    this.habitStore().delete(id)
  }

  ensureDailyTasks(): boolean {
    return this.features.habits?.ensureToday(localDate(this.now())) ?? false
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
    if (!this.features.inspirations) throw new Error('灵感存储不可用。')
    return this.features.inspirations
  }

  listInspirations(): Inspiration[] {
    return this.inspirationStore().list()
  }

  createInspiration(description: string): Inspiration {
    if (typeof description !== 'string' || !description.trim()) throw new Error('灵感不能为空。')
    return this.inspirationStore().create(description.trim())
  }

  updateInspiration(id: string, description: string): Inspiration {
    if (typeof id !== 'string' || !id) throw new Error('灵感标识无效。')
    if (typeof description !== 'string' || !description.trim()) throw new Error('灵感不能为空。')
    return this.inspirationStore().update(id, description.trim())
  }

  appendInspiration(id: string, content: string, additionId?: string): Inspiration {
    if (typeof id !== 'string' || !id) throw new Error('灵感标识无效。')
    if (typeof content !== 'string' || !content.trim()) throw new Error('补充内容不能为空。')
    if (additionId !== undefined && (typeof additionId !== 'string' || !additionId))
      throw new Error('补充标识无效。')
    return this.inspirationStore().append(id, content.trim(), additionId)
  }

  listToday(): TodayTasks {
    const date = localDate(this.now())
    return { date, tasks: this.taskStore().list(date) }
  }

  createTask(description: string, expectedDate?: string): Task {
    if (typeof description !== 'string' || !description.trim())
      throw new Error('任务描述不能为空。')
    const date = localDate(this.now())
    if (expectedDate !== undefined && expectedDate !== date)
      throw new Error('日期已切换，请重新记录今天任务。未保存的输入仍保留。')
    return this.taskStore().create(description.trim(), date)
  }

  updateTask(id: string, description: string): Task {
    if (typeof description !== 'string' || !description.trim())
      throw new Error('任务描述不能为空。')
    return this.taskStore().update(this.taskId(id), localDate(this.now()), {
      description: description.trim()
    })
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

  deleteTask(id: string): void {
    this.taskStore().delete(this.taskId(id), localDate(this.now()))
  }

  convertToMultiDay(id: string): Task {
    const date = localDate(this.now())
    const task = this.taskStore().get(this.taskId(id), date)
    if (task.kind === 'multi-day') return task
    return this.taskStore().update(task.id, date, {
      kind: 'multi-day',
      progress: task.completed ? 100 : 0,
      completedOn: task.completed ? date : null
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
      service: 'mytodo-core',
      checkedAt: new Date().toISOString(),
      storage: this.storage.probe()
    }
  }
}

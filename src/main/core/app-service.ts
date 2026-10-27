import type { CoreProbe, StorageProbe, Task, TodayTasks, Habit } from '../../shared/contracts'
import { localDate } from './tasks'
import type { TaskStore } from './tasks'
import type { HabitStore } from './habits'

export interface StorageDiagnostics {
  probe: () => StorageProbe
}

/** IPC与MCP共用的应用入口。 */
export class AppService {
  constructor(
    private readonly storage: StorageDiagnostics,
    private readonly tasks?: TaskStore,
    private readonly now: () => Date = () => new Date(),
    private readonly features: { habits?: HabitStore } = {}
  ) {}

  listHabits(): Habit[] {
    return this.habitStore().list()
  }

  createHabit(description: string): Habit {
    if (typeof description !== 'string' || !description.trim())
      throw new Error('习惯描述不能为空。')
    return this.habitStore().create(description.trim(), localDate(this.now()))
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

  setTaskProgress(id: string, progress: number): Task {
    if (!Number.isInteger(progress) || progress < 0 || progress > 100)
      throw new Error('进度必须为0至100的整数。')
    const date = localDate(this.now())
    const task = this.taskStore().get(this.taskId(id), date)
    if (task.kind !== 'multi-day') throw new Error('今天任务无需设置进度。')
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

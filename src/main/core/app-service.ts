import type { CoreProbe, Inspiration, StorageProbe, Task, TodayTasks } from '../../shared/contracts'
import { localDate } from './tasks'
import type { TaskStore } from './tasks'
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
    private readonly features: { inspirations?: InspirationStore } = {}
  ) {}

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
    return this.taskStore().update(this.taskId(id), localDate(this.now()), { completed })
  }

  deleteTask(id: string): void {
    this.taskStore().delete(this.taskId(id), localDate(this.now()))
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

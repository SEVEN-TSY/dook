import type { Task, Subitem } from '../../shared/contracts'

export interface TaskStore {
  list(date: string): Task[]
  listArchived(): Task[]
  archive(id: string, date: string, archivedAt: string): void
  restore(id: string, date: string): Task
  deleteArchived(id: string): void
  get(id: string, date: string): Task
  create(description: string, date: string, createdAt: string): Task
  update(id: string, date: string, change: TaskChange): Task
  skip(id: string, date: string): void
  setOrder(ids: string[]): void
  transaction<T>(action: () => T): T
  addSubitem(taskId: string, description: string): Subitem
  updateSubitem(
    taskId: string,
    id: string,
    change: { description?: string; completed?: boolean }
  ): void
  deleteSubitem(taskId: string, id: string): void
  setSubitemOrder(taskId: string, ids: string[]): void
  setSubitemsCompleted(taskId: string, completed: boolean): void
  delete(id: string, date: string): void
}

export interface TaskChange {
  date?: string
  updatedAt?: string
  pinned?: boolean
  description?: string
  completed?: boolean
  kind?: Task['kind']
  progress?: number
  completedOn?: string | null
}

export function localDate(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

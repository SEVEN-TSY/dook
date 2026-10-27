import type { Task } from '../../shared/contracts'

export interface TaskStore {
  list(date: string): Task[]
  create(description: string, date: string): Task
  update(id: string, date: string, change: { description?: string; completed?: boolean }): Task
  delete(id: string, date: string): void
}

export function localDate(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

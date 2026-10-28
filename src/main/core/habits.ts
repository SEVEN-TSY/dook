import type { Habit } from '../../shared/contracts'

/** 每日任务与生成记录在同一事务中保存，任务删除不清除生成记录。 */
export interface HabitStore {
  list(): Habit[]
  create(description: string, date: string): Habit
  createFromTask(taskId: string, date: string): Habit
  update(id: string, description: string, date: string): Habit
  delete(id: string): void
  ensureToday(date: string): boolean
}

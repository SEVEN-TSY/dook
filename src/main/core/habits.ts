import type { Habit, HabitSchedule } from '../../shared/contracts'

/** 每日任务与生成记录在同一事务中保存，任务删除不清除生成记录。 */
export interface HabitStore {
  setSchedule(id: string, schedule: HabitSchedule, date: string, now: string): Habit
  list(archived?: boolean, now?: string): Habit[]
  archive(id: string, date: string, archivedAt: string): void
  restore(id: string, date: string, createdAt: string): void
  deleteArchived(id: string): void
  create(description: string, date: string, createdAt: string): Habit
  createFromTask(taskId: string, date: string, createdAt: string): Habit
  update(id: string, description: string, date: string): Habit
  delete(id: string, date: string): void
  ensureToday(date: string, createdAt: string): boolean
}

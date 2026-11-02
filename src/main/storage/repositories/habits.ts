import { habitIsDue } from '../../core/habit-schedule'
import { defaultHabitSchedule } from '../../../shared/habit-schedule'
import { randomUUID } from 'node:crypto'
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import type { Habit, HabitSchedule } from '../../../shared/contracts'
import type { HabitStore } from '../../core/habits'

const fromRow = (row: Record<string, SQLOutputValue>): Habit => ({
  id: String(row.id),
  description: String(row.description),
  createdAt: row.created_at == null ? null : String(row.created_at),
  ...(row.schedule ? { schedule: JSON.parse(String(row.schedule)) as HabitSchedule } : {})
})

export class HabitRepository implements HabitStore {
  constructor(private readonly database: DatabaseSync) {}

  list(archived = false): Habit[] {
    return this.database
      .prepare(
        'SELECT id, description, created_at, schedule FROM habits WHERE archived = ? ORDER BY sequence'
      )
      .all(archived ? 1 : 0)
      .map(fromRow)
  }

  create(description: string, date: string, createdAt: string): Habit {
    return this.transaction(() => {
      const habit = { id: randomUUID(), description, createdAt, schedule: defaultHabitSchedule() }
      this.database
        .prepare('INSERT INTO habits (id, description, created_at, schedule) VALUES (?, ?, ?, ?)')
        .run(habit.id, description, createdAt, JSON.stringify(habit.schedule))
      this.generate(habit, date, createdAt)
      return habit
    })
  }

  createFromTask(taskId: string, date: string, createdAt: string): Habit {
    return this.transaction(() => {
      const task = this.database
        .prepare(
          "SELECT description, habit_id FROM tasks WHERE id = ? AND date = ? AND kind = 'today' AND archived_at IS NULL"
        )
        .get(taskId, date)
      if (!task) throw new Error('今天任务不存在，可能已删除或日期已切换。')
      if (task.habit_id !== null) {
        const existing = this.database
          .prepare('SELECT id, description, created_at, schedule FROM habits WHERE id = ?')
          .get(task.habit_id)
        if (!existing) throw new Error('该任务已关联过习惯。')
        return fromRow(existing)
      }
      const habit = {
        id: randomUUID(),
        description: String(task.description),
        createdAt,
        schedule: defaultHabitSchedule()
      }
      this.database
        .prepare('INSERT INTO habits (id, description, created_at, schedule) VALUES (?, ?, ?, ?)')
        .run(habit.id, habit.description, createdAt, JSON.stringify(habit.schedule))
      this.database.prepare('UPDATE tasks SET habit_id = ? WHERE id = ?').run(habit.id, taskId)
      this.database
        .prepare('INSERT INTO habit_generations (habit_id, date, task_id) VALUES (?, ?, ?)')
        .run(habit.id, date, taskId)
      return habit
    })
  }

  update(id: string, description: string, date: string): Habit {
    return this.transaction(() => {
      const row = this.database
        .prepare(
          'UPDATE habits SET description = ? WHERE id = ? AND archived = 0 RETURNING id, description, created_at, schedule'
        )
        .get(description, id)
      if (!row) throw new Error('习惯不存在，可能已删除。')
      this.database
        .prepare(
          "UPDATE tasks SET description = ? WHERE habit_id = ? AND date = ? AND kind = 'today'"
        )
        .run(description, id, date)
      return fromRow(row)
    })
  }

  delete(id: string, date: string): void {
    this.transaction(() => {
      const result = this.database
        .prepare('DELETE FROM habits WHERE id = ? AND archived = 0')
        .run(id)
      if (!result.changes) throw new Error('习惯不存在，可能已删除。')
      this.database.prepare('DELETE FROM tasks WHERE habit_id = ? AND date = ?').run(id, date)
    })
  }

  archive(id: string, date: string): void {
    this.transaction(() => {
      const result = this.database
        .prepare('UPDATE habits SET archived = 1 WHERE id = ? AND archived = 0')
        .run(id)
      if (!result.changes) throw new Error('习惯不存在，可能已归档或删除。')
      this.database.prepare('DELETE FROM tasks WHERE habit_id = ? AND date = ?').run(id, date)
    })
  }

  restore(id: string, date: string, createdAt: string): void {
    this.transaction(() => {
      const row = this.database
        .prepare(
          'UPDATE habits SET archived = 0 WHERE id = ? AND archived = 1 RETURNING id, description, created_at, schedule'
        )
        .get(id)
      if (!row) throw new Error('归档习惯不存在，可能已恢复或删除。')
      this.database
        .prepare('DELETE FROM habit_generations WHERE habit_id = ? AND date = ?')
        .run(id, date)
      this.generate(fromRow(row), date, createdAt)
    })
  }

  deleteArchived(id: string): void {
    this.transaction(() => {
      const result = this.database
        .prepare('DELETE FROM habits WHERE id = ? AND archived = 1')
        .run(id)
      if (!result.changes) throw new Error('归档习惯不存在，可能已恢复或删除。')
      this.database.prepare('DELETE FROM habit_generations WHERE habit_id = ?').run(id)
    })
  }

  setSchedule(id: string, schedule: HabitSchedule, date: string, now: string): Habit {
    return this.transaction(() => {
      const current = this.database
        .prepare(
          'SELECT id, description, created_at, schedule FROM habits WHERE id = ? AND archived = 0'
        )
        .get(id)
      if (!current) throw new Error('习惯不存在，可能已归档或删除。')
      const previous = fromRow(current).schedule
      const saved =
        schedule.kind === 'interval'
          ? {
              ...schedule,
              startsOn:
                previous?.kind === 'interval' && previous.intervalDays === schedule.intervalDays
                  ? previous.startsOn
                  : date
            }
          : schedule
      const row = this.database
        .prepare(
          'UPDATE habits SET schedule = ? WHERE id = ? RETURNING id, description, created_at, schedule'
        )
        .get(JSON.stringify(saved), id)!
      const habit = fromRow(row)
      this.generate(habit, date, now)
      return habit
    })
  }

  ensureToday(date: string, createdAt: string): boolean {
    return this.transaction(() => {
      let changed = false
      for (const habit of this.list()) changed = this.generate(habit, date, createdAt) || changed
      return changed
    })
  }

  private generate(habit: Habit, date: string, createdAt: string): boolean {
    if (!habitIsDue(habit.schedule, date, new Date(createdAt))) return false
    const recorded = this.database
      .prepare('SELECT 1 FROM habit_generations WHERE habit_id = ? AND date = ?')
      .get(habit.id, date)
    if (recorded) return false
    const taskId = randomUUID()
    this.database
      .prepare(
        'INSERT INTO tasks (id, description, date, habit_id, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(taskId, habit.description, date, habit.id, createdAt)
    this.database
      .prepare('INSERT INTO habit_generations (habit_id, date, task_id) VALUES (?, ?, ?)')
      .run(habit.id, date, taskId)
    return true
  }

  private transaction<T>(action: () => T): T {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const result = action()
      this.database.exec('COMMIT')
      return result
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
}

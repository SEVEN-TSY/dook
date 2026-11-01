import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Habit } from '../../../shared/contracts'
import type { HabitStore } from '../../core/habits'

export class HabitRepository implements HabitStore {
  constructor(private readonly database: DatabaseSync) {}

  list(): Habit[] {
    return this.database
      .prepare('SELECT id, description FROM habits ORDER BY sequence')
      .all()
      .map((row) => ({ id: String(row.id), description: String(row.description) }))
  }

  create(description: string, date: string): Habit {
    return this.transaction(() => {
      const habit = { id: randomUUID(), description }
      this.database
        .prepare('INSERT INTO habits (id, description) VALUES (?, ?)')
        .run(habit.id, description)
      this.generate(habit, date)
      return habit
    })
  }

  createFromTask(taskId: string, date: string): Habit {
    return this.transaction(() => {
      const task = this.database
        .prepare(
          "SELECT description, habit_id FROM tasks WHERE id = ? AND date = ? AND kind = 'today' AND archived_at IS NULL"
        )
        .get(taskId, date)
      if (!task) throw new Error('今天任务不存在，可能已删除或日期已切换。')
      if (task.habit_id !== null) {
        const existing = this.database
          .prepare('SELECT id, description FROM habits WHERE id = ?')
          .get(task.habit_id)
        if (!existing) throw new Error('该任务已关联过习惯。')
        return { id: String(existing.id), description: String(existing.description) }
      }
      const habit = { id: randomUUID(), description: String(task.description) }
      this.database
        .prepare('INSERT INTO habits (id, description) VALUES (?, ?)')
        .run(habit.id, habit.description)
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
        .prepare('UPDATE habits SET description = ? WHERE id = ? RETURNING id, description')
        .get(description, id)
      if (!row) throw new Error('习惯不存在，可能已删除。')
      this.database
        .prepare(
          "UPDATE tasks SET description = ? WHERE habit_id = ? AND date = ? AND kind = 'today'"
        )
        .run(description, id, date)
      return { id: String(row.id), description: String(row.description) }
    })
  }

  delete(id: string): void {
    const result = this.database.prepare('DELETE FROM habits WHERE id = ?').run(id)
    if (!result.changes) throw new Error('习惯不存在，可能已删除。')
  }

  ensureToday(date: string): boolean {
    return this.transaction(() => {
      let changed = false
      for (const habit of this.list()) changed = this.generate(habit, date) || changed
      return changed
    })
  }

  private generate(habit: Habit, date: string): boolean {
    const recorded = this.database
      .prepare('SELECT 1 FROM habit_generations WHERE habit_id = ? AND date = ?')
      .get(habit.id, date)
    if (recorded) return false
    const taskId = randomUUID()
    this.database
      .prepare('INSERT INTO tasks (id, description, date, habit_id) VALUES (?, ?, ?, ?)')
      .run(taskId, habit.description, date, habit.id)
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

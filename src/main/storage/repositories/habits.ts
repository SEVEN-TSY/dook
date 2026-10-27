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

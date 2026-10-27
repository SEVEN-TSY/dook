import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Task } from '../../../shared/contracts'
import type { TaskStore } from '../../core/tasks'

export class TaskRepository implements TaskStore {
  constructor(private readonly database: DatabaseSync) {}

  list(date: string): Task[] {
    return this.database
      .prepare(
        'SELECT id, description, date, completed, habit_id FROM tasks WHERE date = ? ORDER BY sequence'
      )
      .all(date)
      .map((row) => ({
        id: String(row.id),
        description: String(row.description),
        date: String(row.date),
        completed: row.completed === 1,
        ...(row.habit_id == null ? {} : { habitId: String(row.habit_id) })
      }))
  }

  create(description: string, date: string): Task {
    const task = { id: randomUUID(), description, date, completed: false }
    this.database
      .prepare('INSERT INTO tasks (id, description, date) VALUES (?, ?, ?)')
      .run(task.id, description, date)
    return task
  }

  update(id: string, date: string, change: { description?: string; completed?: boolean }): Task {
    const row = this.database
      .prepare(
        `UPDATE tasks SET description = COALESCE(?, description), completed = COALESCE(?, completed)
      WHERE id = ? AND date = ? RETURNING id, description, date, completed, habit_id`
      )
      .get(
        change.description ?? null,
        change.completed === undefined ? null : Number(change.completed),
        id,
        date
      )
    if (!row) throw new Error('今天任务不存在，可能已删除或日期已切换。')
    return {
      id: String(row.id),
      description: String(row.description),
      date: String(row.date),
      completed: row.completed === 1,
      ...(row.habit_id == null ? {} : { habitId: String(row.habit_id) })
    }
  }

  delete(id: string, date: string): void {
    const result = this.database
      .prepare('DELETE FROM tasks WHERE id = ? AND date = ?')
      .run(id, date)
    if (!result.changes) throw new Error('今天任务不存在，可能已删除或日期已切换。')
  }
}

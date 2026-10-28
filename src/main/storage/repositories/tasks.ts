import { randomUUID } from 'node:crypto'
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import type { Task, Subitem } from '../../../shared/contracts'
import type { TaskStore, TaskChange } from '../../core/tasks'

const visible = `(kind = 'today' AND date = ?) OR
  (kind = 'multi-day' AND (completed = 0 OR completed_on = ?))`
const fields = 'id, description, date, completed, kind, progress, completed_on, habit_id'
const taskFromRow = (row: Record<string, SQLOutputValue>): Task => ({
  id: String(row.id),
  description: String(row.description),
  date: String(row.date),
  completed: row.completed === 1,
  kind: row.kind === 'multi-day' ? 'multi-day' : 'today',
  progress: Number(row.progress),
  completedOn: row.completed_on === null ? null : String(row.completed_on),
  ...(row.habit_id == null ? {} : { habitId: String(row.habit_id) })
})

export class TaskRepository implements TaskStore {
  constructor(private readonly database: DatabaseSync) {}

  private taskWithSubitems(row: Record<string, SQLOutputValue>): Task {
    const task = taskFromRow(row)
    const subitems = this.database
      .prepare(
        'SELECT id, description, completed FROM task_subitems WHERE task_id = ? ORDER BY sequence'
      )
      .all(task.id)
      .map((item) => ({
        id: String(item.id),
        description: String(item.description),
        completed: item.completed === 1
      }))
    return subitems.length ? { ...task, subitems } : task
  }

  transaction<T>(action: () => T): T {
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

  addSubitem(taskId: string, description: string): Subitem {
    const item = { id: randomUUID(), description, completed: false }
    this.database
      .prepare('INSERT INTO task_subitems (id, task_id, description) VALUES (?, ?, ?)')
      .run(item.id, taskId, description)
    return item
  }

  updateSubitem(
    taskId: string,
    id: string,
    change: { description?: string; completed?: boolean }
  ): void {
    const result = this.database
      .prepare(
        'UPDATE task_subitems SET description = COALESCE(?, description), completed = COALESCE(?, completed) WHERE task_id = ? AND id = ?'
      )
      .run(
        change.description ?? null,
        change.completed === undefined ? null : Number(change.completed),
        taskId,
        id
      )
    if (!result.changes) throw new Error('子事项不存在，可能已删除。')
  }

  deleteSubitem(taskId: string, id: string): void {
    const result = this.database
      .prepare('DELETE FROM task_subitems WHERE task_id = ? AND id = ?')
      .run(taskId, id)
    if (!result.changes) throw new Error('子事项不存在，可能已删除。')
  }

  setSubitemsCompleted(taskId: string, completed: boolean): void {
    this.database
      .prepare('UPDATE task_subitems SET completed = ? WHERE task_id = ?')
      .run(Number(completed), taskId)
  }

  list(date: string): Task[] {
    return this.database
      .prepare(`SELECT ${fields} FROM tasks WHERE ${visible} ORDER BY kind = 'multi-day', sequence`)
      .all(date, date)
      .map((row) => this.taskWithSubitems(row))
  }

  get(id: string, date: string): Task {
    const row = this.database
      .prepare(`SELECT ${fields} FROM tasks WHERE id = ? AND (${visible})`)
      .get(id, date, date)
    if (!row) throw new Error('任务不存在，可能已删除或日期已切换。')
    return this.taskWithSubitems(row)
  }

  create(description: string, date: string): Task {
    const id = randomUUID()
    this.database
      .prepare('INSERT INTO tasks (id, description, date) VALUES (?, ?, ?)')
      .run(id, description, date)
    return this.get(id, date)
  }

  update(id: string, date: string, change: TaskChange): Task {
    const row = this.database
      .prepare(
        `UPDATE tasks SET
      description = COALESCE(?, description), completed = COALESCE(?, completed),
      kind = COALESCE(?, kind), progress = COALESCE(?, progress),
      completed_on = CASE WHEN ? THEN ? ELSE completed_on END
      WHERE id = ? AND (${visible}) RETURNING ${fields}`
      )
      .get(
        change.description ?? null,
        change.completed === undefined ? null : Number(change.completed),
        change.kind ?? null,
        change.progress ?? null,
        Number(change.completedOn !== undefined),
        change.completedOn ?? null,
        id,
        date,
        date
      )
    if (!row) throw new Error('任务不存在，可能已删除或日期已切换。')
    return this.taskWithSubitems(row)
  }

  delete(id: string, date: string): void {
    const result = this.database
      .prepare(`DELETE FROM tasks WHERE id = ? AND (${visible})`)
      .run(id, date, date)
    if (!result.changes) throw new Error('任务不存在，可能已删除或日期已切换。')
  }
}

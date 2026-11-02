import { randomUUID } from 'node:crypto'
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import type { Task, Subitem } from '../../../shared/contracts'
import type { TaskStore, TaskChange } from '../../core/tasks'

const visible = `archived_at IS NULL AND ((kind = 'today' AND date = ? AND skipped_on IS NULL) OR
  (kind = 'multi-day' AND (completed = 0 OR completed_on = ?)))`
const fields =
  'id, description, date, completed, kind, progress, completed_on, habit_id, pinned, created_at'
const taskFromRow = (row: Record<string, SQLOutputValue>): Task => ({
  ...(row.pinned === 1 ? { pinned: true } : {}),
  createdAt: row.created_at == null ? null : String(row.created_at),
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
      .prepare(
        `SELECT ${fields} FROM tasks WHERE ${visible} ORDER BY kind = 'multi-day', pinned DESC, COALESCE(sort_order, sequence), sequence`
      )
      .all(date, date)
      .map((row) => this.taskWithSubitems(row))
  }

  listArchived(): Task[] {
    return this.database
      .prepare(
        `SELECT ${fields} FROM tasks WHERE archived_at IS NOT NULL ORDER BY archived_at DESC, sequence DESC`
      )
      .all()
      .map((row) => this.taskWithSubitems(row))
  }

  archive(id: string, date: string, archivedAt: string): void {
    const result = this.database
      .prepare(
        `UPDATE tasks SET archived_at = ? WHERE id = ? AND habit_id IS NULL AND (${visible})`
      )
      .run(archivedAt, id, date, date)
    if (!result.changes) throw new Error('任务不存在，可能已归档或日期已切换。')
  }

  restore(id: string, date: string): Task {
    const row = this.database
      .prepare(
        `UPDATE tasks SET archived_at = NULL,
      date = CASE WHEN kind = 'today' THEN ? ELSE date END,
      completed_on = CASE WHEN kind = 'multi-day' AND completed = 1 THEN ? ELSE completed_on END
      WHERE id = ? AND archived_at IS NOT NULL RETURNING ${fields}`
      )
      .get(date, date, id)
    if (!row) throw new Error('归档任务不存在，可能已恢复或删除。')
    return this.taskWithSubitems(row)
  }

  deleteArchived(id: string): void {
    const result = this.database
      .prepare('DELETE FROM tasks WHERE id = ? AND archived_at IS NOT NULL')
      .run(id)
    if (!result.changes) throw new Error('归档任务不存在，可能已恢复或删除。')
  }

  get(id: string, date: string): Task {
    const row = this.database
      .prepare(`SELECT ${fields} FROM tasks WHERE id = ? AND (${visible})`)
      .get(id, date, date)
    if (!row) throw new Error('任务不存在，可能已删除或日期已切换。')
    return this.taskWithSubitems(row)
  }

  skip(id: string, date: string): void {
    const result = this.database
      .prepare(
        "UPDATE tasks SET skipped_on = ? WHERE id = ? AND date = ? AND kind = 'today' AND habit_id IS NOT NULL AND skipped_on IS NULL"
      )
      .run(date, id, date)
    if (!result.changes) throw new Error('今天的习惯任务不存在或已暂停。')
  }

  setOrder(ids: string[]): void {
    const update = this.database.prepare('UPDATE tasks SET sort_order = ? WHERE id = ?')
    ids.forEach((id, index) => update.run(index + 1, id))
  }

  create(description: string, date: string, createdAt: string): Task {
    const id = randomUUID()
    this.database
      .prepare(
        `INSERT INTO tasks (id, description, date, created_at, sort_order)
        SELECT ?, ?, ?, ?, COALESCE(MIN(COALESCE(sort_order, sequence)), 1) - 1
        FROM tasks WHERE date = ? AND kind = 'today' AND pinned = 0 AND archived_at IS NULL`
      )
      .run(id, description, date, createdAt, date)
    return this.get(id, date)
  }

  update(id: string, date: string, change: TaskChange): Task {
    const row = this.database
      .prepare(
        `UPDATE tasks SET
      pinned = COALESCE(?, pinned), description = COALESCE(?, description), completed = COALESCE(?, completed),
      kind = COALESCE(?, kind), progress = COALESCE(?, progress),
      completed_on = CASE WHEN ? THEN ? ELSE completed_on END
      WHERE id = ? AND (${visible}) RETURNING ${fields}`
      )
      .get(
        change.pinned === undefined ? null : Number(change.pinned),
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

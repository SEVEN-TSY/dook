import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Inspiration, InspirationAddition, InspirationPage } from '../../../shared/contracts'
import type { InspirationStore } from '../../core/inspirations'

export class InspirationRepository implements InspirationStore {
  constructor(private readonly database: DatabaseSync) {}

  list(): Inspiration[] {
    const additions = new Map<string, InspirationAddition[]>()
    for (const row of this.database
      .prepare('SELECT id, inspiration_id, content FROM inspiration_additions ORDER BY sequence')
      .all()) {
      const id = String(row.inspiration_id)
      const items = additions.get(id) ?? []
      items.push({ id: String(row.id), content: String(row.content) })
      additions.set(id, items)
    }
    return this.database
      .prepare('SELECT id, description, created_at FROM inspirations ORDER BY sequence')
      .all()
      .map((row) => ({
        id: String(row.id),
        description: String(row.description),
        createdAt: row.created_at === null ? null : String(row.created_at),
        additions: additions.get(String(row.id)) ?? []
      }))
  }

  page(offset: number, limit: number): InspirationPage {
    const rows = this.database
      .prepare(
        `SELECT id, description, created_at FROM inspirations ORDER BY created_at IS NULL, created_at DESC, sequence DESC LIMIT ? OFFSET ?`
      )
      .all(limit + 1, offset)
    const items = rows.slice(0, limit).map((row) => ({
      id: String(row.id),
      description: String(row.description),
      createdAt: row.created_at === null ? null : String(row.created_at),
      additions: this.database
        .prepare(
          'SELECT id, content FROM inspiration_additions WHERE inspiration_id = ? ORDER BY sequence'
        )
        .all(String(row.id))
        .map((addition) => ({ id: String(addition.id), content: String(addition.content) }))
    }))
    return { items, hasMore: rows.length > limit }
  }

  create(description: string, createdAt: string): Inspiration {
    const inspiration = { id: randomUUID(), description, additions: [], createdAt }
    this.database
      .prepare('INSERT INTO inspirations (id, description, created_at) VALUES (?, ?, ?)')
      .run(inspiration.id, description, createdAt)
    return inspiration
  }

  private get(id: string): Inspiration {
    const idea = this.list().find((item) => item.id === id)
    if (!idea) throw new Error('灵感不存在。')
    return idea
  }

  update(id: string, description: string): Inspiration {
    const result = this.database
      .prepare('UPDATE inspirations SET description = ? WHERE id = ?')
      .run(description, id)
    if (!result.changes) throw new Error('灵感不存在。')
    return this.get(id)
  }

  append(id: string, content: string, additionId = randomUUID()): Inspiration {
    this.get(id)
    const result = this.database
      .prepare(
        `
      INSERT INTO inspiration_additions (id, inspiration_id, content) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET content = excluded.content
      WHERE inspiration_additions.inspiration_id = excluded.inspiration_id
    `
      )
      .run(additionId, id, content)
    if (!result.changes) throw new Error('补充标识已用于其他灵感。')
    return this.get(id)
  }
}

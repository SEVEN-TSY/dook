import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type {
  Inspiration,
  InspirationAddition,
  InspirationPage,
  InspirationGroup,
  InspirationTopic
} from '../../../shared/contracts'
import type { InspirationStore } from '../../core/inspirations'

export class InspirationRepository implements InspirationStore {
  constructor(private readonly database: DatabaseSync) {}

  listTopics(): InspirationTopic[] {
    return this.database
      .prepare('SELECT id, name FROM inspiration_topics ORDER BY sequence')
      .all()
      .map((row) => ({ id: String(row.id), name: String(row.name) }))
  }

  createTopic(name: string, inspirationId?: string): InspirationTopic {
    if (inspirationId !== undefined) this.get(inspirationId)
    const topic = { id: randomUUID(), name }
    this.database.exec('BEGIN')
    try {
      this.database
        .prepare('INSERT INTO inspiration_topics (id, name) VALUES (?, ?)')
        .run(topic.id, name)
      if (inspirationId !== undefined)
        this.database
          .prepare('INSERT INTO inspiration_topic_members (inspiration_id, topic_id) VALUES (?, ?)')
          .run(inspirationId, topic.id)
      this.database.exec('COMMIT')
      return topic
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  topicDetails(id: string): { name: string; count: number } {
    const row = this.database
      .prepare(
        'SELECT name, (SELECT COUNT(*) FROM inspiration_topic_members WHERE topic_id = ?) AS count FROM inspiration_topics WHERE id = ?'
      )
      .get(id, id)
    if (!row) throw new Error('主题不存在。')
    return { name: String(row.name), count: Number(row.count) }
  }

  deleteTopic(id: string): void {
    if (!this.database.prepare('DELETE FROM inspiration_topics WHERE id = ?').run(id).changes)
      throw new Error('主题不存在。')
  }

  renameTopic(id: string, name: string): void {
    if (
      !this.database.prepare('UPDATE inspiration_topics SET name = ? WHERE id = ?').run(name, id)
        .changes
    )
      throw new Error('主题不存在。')
  }

  setTopic(inspirationId: string, topicId: string, included: boolean): void {
    this.get(inspirationId)
    if (!this.database.prepare('SELECT id FROM inspiration_topics WHERE id = ?').get(topicId))
      throw new Error('主题不存在。')
    if (included)
      this.database
        .prepare(
          'INSERT OR IGNORE INTO inspiration_topic_members (inspiration_id, topic_id) VALUES (?, ?)'
        )
        .run(inspirationId, topicId)
    else
      this.database
        .prepare('DELETE FROM inspiration_topic_members WHERE inspiration_id = ? AND topic_id = ?')
        .run(inspirationId, topicId)
  }

  private topicIds(id: string): string[] {
    return this.database
      .prepare('SELECT topic_id FROM inspiration_topic_members WHERE inspiration_id = ?')
      .all(id)
      .map((row) => String(row.topic_id))
  }

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
      .prepare(
        'SELECT id, description, created_at FROM inspirations WHERE archived = 0 ORDER BY sequence'
      )
      .all()
      .map((row) => ({
        id: String(row.id),
        description: String(row.description),
        createdAt: row.created_at === null ? null : String(row.created_at),
        topicIds: this.topicIds(String(row.id)),
        additions: additions.get(String(row.id)) ?? []
      }))
  }

  page(offset: number, limit: number, group?: InspirationGroup): InspirationPage {
    let where = ''
    let parameters: string[] = []
    if (group?.kind === 'topic') {
      where =
        'WHERE EXISTS (SELECT 1 FROM inspiration_topic_members m WHERE m.inspiration_id = inspirations.id AND m.topic_id = ?)'
      parameters = [group.topicId]
    } else if (group?.kind === 'unassigned') {
      where =
        'WHERE NOT EXISTS (SELECT 1 FROM inspiration_topic_members m WHERE m.inspiration_id = inspirations.id)'
    } else if (group?.kind === 'date' || group?.kind === 'history') {
      where =
        group.kind === 'date'
          ? 'WHERE created_at >= ? AND created_at < ?'
          : 'WHERE created_at IS NULL OR created_at < ? OR created_at >= ?'
      parameters = [group.start, group.end]
    }
    where = where
      ? `WHERE archived = 0 AND (${where.slice(6)})`
      : `WHERE archived = ${group?.kind === 'archive' ? 1 : 0}`
    const rows = this.database
      .prepare(
        `SELECT id, description, created_at FROM inspirations ${where} ORDER BY created_at IS NULL, created_at DESC, sequence DESC LIMIT ? OFFSET ?`
      )
      .all(...parameters, limit + 1, offset)
    const items = rows.slice(0, limit).map((row) => ({
      id: String(row.id),
      description: String(row.description),
      createdAt: row.created_at === null ? null : String(row.created_at),
      topicIds: this.topicIds(String(row.id)),
      additions: this.database
        .prepare(
          'SELECT id, content FROM inspiration_additions WHERE inspiration_id = ? ORDER BY sequence'
        )
        .all(String(row.id))
        .map((addition) => ({ id: String(addition.id), content: String(addition.content) }))
    }))
    return { items, hasMore: rows.length > limit }
  }

  create(
    description: string,
    createdAt: string,
    topicId?: string,
    creationId?: string
  ): Inspiration {
    if (
      creationId &&
      this.database.prepare('SELECT id FROM inspirations WHERE id = ?').get(creationId)
    )
      return this.get(creationId)
    const inspiration: Inspiration = {
      id: creationId || randomUUID(),
      description,
      additions: [],
      createdAt,
      topicIds: topicId ? [topicId] : []
    }
    this.database.exec('BEGIN')
    try {
      this.database
        .prepare('INSERT INTO inspirations (id, description, created_at) VALUES (?, ?, ?)')
        .run(inspiration.id, description, createdAt)
      if (topicId) {
        if (!this.database.prepare('SELECT id FROM inspiration_topics WHERE id = ?').get(topicId))
          throw new Error('主题不存在。')
        this.database
          .prepare('INSERT INTO inspiration_topic_members (inspiration_id, topic_id) VALUES (?, ?)')
          .run(inspiration.id, topicId)
      }
      this.database.exec('COMMIT')
      return inspiration
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  private get(id: string): Inspiration {
    const idea = this.list().find((item) => item.id === id)
    if (!idea) throw new Error('灵感不存在。')
    return idea
  }

  archive(id: string): void {
    this.changeArchive(id, 0, 1)
  }
  restore(id: string): void {
    this.changeArchive(id, 1, 0)
  }
  private changeArchive(id: string, from: number, to: number): void {
    if (
      !this.database
        .prepare('UPDATE inspirations SET archived = ? WHERE id = ? AND archived = ?')
        .run(to, id, from).changes
    )
      throw new Error('灵感状态已变化或不存在。')
  }
  deleteArchived(id: string): void {
    if (
      !this.database.prepare('DELETE FROM inspirations WHERE id = ? AND archived = 1').run(id)
        .changes
    )
      throw new Error('已归档灵感不存在。')
  }

  update(id: string, description: string): Inspiration {
    const result = this.database
      .prepare('UPDATE inspirations SET description = ? WHERE id = ? AND archived = 0')
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

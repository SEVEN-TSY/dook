import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'

const tokenCount = z.number().int().nonnegative().optional()
const usageSchema = z.object({
  prompt_tokens: tokenCount,
  completion_tokens: tokenCount,
  total_tokens: tokenCount,
  prompt_cache_hit_tokens: tokenCount,
  prompt_cache_miss_tokens: tokenCount,
  completion_tokens_details: z.object({ reasoning_tokens: tokenCount }).optional()
})

export function readAiUsage(value: unknown) {
  const result = usageSchema.safeParse(value)
  return result.success && Object.keys(result.data).length ? result.data : undefined
}

export type AiCompletionEvent =
  'daily_report' | 'weekly_report' | 'monthly_report' | 'inspiration_collection' | 'reminder'

export interface AiCallEntry {
  configurationId: string
  model: string
  event: 'verify' | 'test' | AiCompletionEvent
  calledAt: string
  durationMs: number
  outcome: 'success' | 'error' | 'cancelled' | 'timeout'
  httpStatus?: number
  usage?: ReturnType<typeof readAiUsage>
}

const legacyEntrySchema = z.object({
  configurationId: z.string(),
  model: z.string(),
  purpose: z.enum(['verify', 'test', 'complete']),
  calledAt: z.iso.datetime(),
  durationMs: z.number().int().nonnegative(),
  outcome: z.enum(['success', 'error', 'cancelled', 'timeout']),
  httpStatus: z.number().int().optional(),
  usage: z.unknown().optional()
})

export class AiCallLog {
  private readonly summary
  private readonly insert

  constructor(
    private readonly db: DatabaseSync,
    directory: string
  ) {
    this.summary = db.prepare(`
      SELECT MAX(called_at) AS last_called_at, SUM(total_tokens) AS total_tokens
      FROM ai_call_logs WHERE configuration_id = ?
    `)
    this.insert = db.prepare(`
      INSERT INTO ai_call_logs (
        configuration_id, model, event, called_at, duration_ms, outcome, http_status,
        prompt_tokens, completion_tokens, total_tokens, prompt_cache_hit_tokens,
        prompt_cache_miss_tokens, reasoning_tokens
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    try {
      this.importLegacy(join(directory, 'ai-calls.jsonl'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('无法导入旧AI调用日志。')
    }
  }

  summarize(id: string): { lastCalledAt: string | null; totalTokens: number | null } {
    const row = this.summary.get(id)
    return {
      lastCalledAt: typeof row?.last_called_at === 'string' ? row.last_called_at : null,
      totalTokens: typeof row?.total_tokens === 'number' ? row.total_tokens : null
    }
  }

  append(entry: AiCallEntry) {
    try {
      this.write(entry)
    } catch {
      console.warn('无法写入AI调用日志。')
    }
  }

  private write(entry: Omit<AiCallEntry, 'event'> & { event: AiCallEntry['event'] | 'complete' }) {
    const { usage } = entry
    this.insert.run(
      entry.configurationId,
      entry.model,
      entry.event,
      entry.calledAt,
      entry.durationMs,
      entry.outcome,
      entry.httpStatus ?? null,
      usage?.prompt_tokens ?? null,
      usage?.completion_tokens ?? null,
      usage?.total_tokens ?? null,
      usage?.prompt_cache_hit_tokens ?? null,
      usage?.prompt_cache_miss_tokens ?? null,
      usage?.completion_tokens_details?.reasoning_tokens ?? null
    )
  }

  private importLegacy(path: string) {
    const key = 'ai_call_logs_jsonl_imported'
    if (this.db.prepare('SELECT 1 FROM app_metadata WHERE key = ?').get(key)) return
    const lines = readFileSync(path, 'utf8').split('\n')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const line of lines) {
        if (!line.trim()) continue
        let value: unknown
        try {
          value = JSON.parse(line)
        } catch {
          // An interrupted append can leave a partial line.
          continue
        }
        const record = legacyEntrySchema.safeParse(value)
        if (record.success) {
          const { purpose, usage, ...entry } = record.data
          this.write({ ...entry, event: purpose, usage: readAiUsage(usage) })
        }
      }
      this.db.prepare('INSERT INTO app_metadata VALUES (?, ?)').run(key, '1')
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
}

import type { DatabaseSync } from 'node:sqlite'
import type { DailyReport } from '../../../shared/daily-report'
import type { DailyReportStore } from '../../core/daily-reports'

export class DailyReportRepository implements DailyReportStore {
  constructor(private readonly database: DatabaseSync) {}

  read(date: string): DailyReport | null {
    const row = this.database.prepare('SELECT * FROM daily_reports WHERE date = ?').get(date)
    if (!row) return null
    return {
      date,
      body: String(row.body),
      cutoff: String(row.cutoff),
      savedAt: String(row.saved_at),
      includeMultiDay: row.include_multi_day === 1,
      materialCount: Number(row.material_count)
    }
  }

  save(report: DailyReport): void {
    this.database
      .prepare(
        `
      INSERT INTO daily_reports (date, body, cutoff, saved_at, include_multi_day, material_count)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET body = excluded.body, cutoff = excluded.cutoff,
        saved_at = excluded.saved_at, include_multi_day = excluded.include_multi_day,
        material_count = excluded.material_count
    `
      )
      .run(
        report.date,
        report.body,
        report.cutoff,
        report.savedAt,
        Number(report.includeMultiDay),
        report.materialCount
      )
  }

  hasActiveCreation(date: string): boolean {
    return Boolean(this.database.prepare('SELECT 1 FROM active_task_days WHERE date = ?').get(date))
  }

  progressDelta(id: string, date: string, mode: 'manual' | 'subitems'): number | undefined {
    const row = this.database
      .prepare('SELECT delta FROM daily_task_progress WHERE task_id = ? AND date = ? AND mode = ?')
      .get(id, date, mode)
    return row ? Number(row.delta) : undefined
  }
}

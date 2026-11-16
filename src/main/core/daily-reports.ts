import type { DailyReport, DailyReportView } from '../../shared/daily-report'
import type { Task } from '../../shared/contracts'
import { localDate } from './tasks'
import type { TaskStore } from './tasks'
import { reportMaterial, renderDailyReport } from './daily-report-material'

export interface DailyReportStore {
  read(date: string): DailyReport | null
  save(report: DailyReport): void
  hasActiveCreation(date: string): boolean
  progressDelta(id: string, date: string, mode: 'manual' | 'subitems'): number | undefined
}

function withinScope(tasks: Task[], includeMultiDay: boolean): Task[] {
  return includeMultiDay ? tasks : tasks.filter((task) => task.kind === 'today')
}

export class DailyReports {
  private readonly revisions = new Map<string, number>()

  constructor(
    private readonly tasks: Pick<TaskStore, 'list' | 'listCompletedArchived'>,
    private readonly store: DailyReportStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  read(date: string): DailyReport | null {
    return this.store.read(date)
  }

  view(): DailyReportView {
    const now = new Date(this.now())
    const today = localDate(now)
    const current = this.store.read(today)
    if (current || this.store.hasActiveCreation(today))
      return { date: today, today, report: current }
    now.setDate(now.getDate() - 1)
    const yesterday = localDate(now)
    const report = this.store.read(yesterday)
    return { date: report ? yesterday : today, today, report }
  }

  scope(includeMultiDay: boolean) {
    const date = localDate(this.now())
    const candidates = this.candidates(date)
    return {
      date,
      includeMultiDay,
      hasHiddenMultiDay: !includeMultiDay && candidates.some((task) => task.kind === 'multi-day'),
      materialCount: withinScope(candidates, includeMultiDay).length
    }
  }

  relatedEdits(date: string, includeMultiDay: boolean) {
    const tasks = withinScope(this.candidates(date), includeMultiDay)
    return {
      taskIds: tasks.filter((task) => !task.archivedAt).map((task) => task.id),
      habitIds: tasks.flatMap((task) => (task.habitId ? [task.habitId] : []))
    }
  }

  revision(date: string): number {
    return this.revisions.get(date) ?? 0
  }

  beginEdit(date: string): void {
    if (!this.read(date)) throw new Error('找不到这一天的日报。')
    this.revisions.set(date, this.revision(date) + 1)
  }

  save(date: string, body: string): DailyReport {
    const report = this.read(date)
    if (!report) throw new Error('找不到这一天的日报。')
    this.beginEdit(date)
    const next = { ...report, body, savedAt: this.now().toISOString() }
    this.store.save(next)
    return next
  }

  async generate(
    date: string,
    includeMultiDay: boolean,
    prompt: string,
    complete: (
      prompt: string,
      material: string,
      validate: (response: string) => void
    ) => Promise<string>,
    signal: AbortSignal,
    canAdopt: () => boolean = () => true
  ): Promise<DailyReport | null> {
    const cutoff = this.now()
    if (date !== localDate(cutoff)) throw new Error('日期已切换，请重新准备日报。')
    const revision = this.revision(date)
    const tasks = withinScope(this.candidates(date), includeMultiDay)
    if (!tasks.length) throw new Error('当天没有可用于日报的任务。')
    const material = reportMaterial(tasks, (id, mode) => this.store.progressDelta(id, date, mode))
    if (signal.aborted) return null
    let body: string | undefined
    const response = await complete(prompt, JSON.stringify(material), (content) => {
      body = renderDailyReport(content, material)
    })
    if (signal.aborted || !canAdopt() || revision !== this.revision(date)) return null
    if (date !== localDate(this.now())) throw new Error('日期已切换，请重新准备日报。')
    const report = {
      date,
      body: body ?? renderDailyReport(response, material),
      cutoff: cutoff.toISOString(),
      savedAt: this.now().toISOString(),
      includeMultiDay,
      materialCount: material.length
    }
    this.store.save(report)
    return report
  }

  private candidates(date: string): Task[] {
    const active = this.tasks.list(date).filter((task) => !task.habitId || task.completed)
    return [...active, ...this.tasks.listCompletedArchived(date)]
  }
}

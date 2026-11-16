export interface DailyReport {
  date: string
  body: string
  cutoff: string
  savedAt: string
  includeMultiDay: boolean
  materialCount: number
}

export interface DailyReportView {
  date: string
  today: string
  report: DailyReport | null
}

export interface DailyReportPreparation {
  date: string
  includeMultiDay: boolean
  hasHiddenMultiDay: boolean
  configuration: string | null
  provider: string | null
  materialCount: number
}

export type DailyReportResult =
  | { kind: 'saved'; report: DailyReport }
  | { kind: 'prepare'; preparation: DailyReportPreparation }
  | { kind: 'cancelled' | 'superseded' }

export interface DailyReportEdits {
  taskIds: string[]
  habitIds: string[]
}

export const dailyReportEditKinds = ['task', 'subitem', 'habit'] as const
export type DailyReportEditKind = (typeof dailyReportEditKinds)[number]
export type WindowSaveResult = boolean | DailyReportEditKind[]

export const hiddenMultiDayWarning =
  '当前有持续推进的任务，设置中的“显示持续推进”已关闭。本次日报不会包含这些任务，包括当天已完成的持续推进任务。'

export const dailyReportBodyLimit = 12_000

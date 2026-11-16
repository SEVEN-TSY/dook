import { CalendarCheck, CalendarClock } from 'lucide-react'
import { Button } from '../../components/ui/button'
import type { useDailyReport } from './useDailyReport'

const localTime = (timestamp: string, withDate: boolean) =>
  new Date(timestamp).toLocaleString('zh-CN', {
    ...(withDate ? ({ year: 'numeric', month: '2-digit', day: '2-digit' } as const) : {}),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })

export function DailyReportCard({
  report,
  openSettings
}: {
  report: ReturnType<typeof useDailyReport>
  openSettings: () => void
}) {
  const { view, draft, preparation, phase, error, saveError } = report
  if (!report.open) return null
  const current = view && view.date === view.today
  const saved = draft.report
  const canGenerate = !!(preparation?.materialCount || preparation?.hasHiddenMultiDay)
  return (
    <section className="daily-report task-card-group" aria-labelledby="daily-report-heading">
      <header className="task-card-heading daily-report-header">
        <h2 id="daily-report-heading" tabIndex={-1} ref={report.heading}>
          <CalendarCheck className="task-card-icon" aria-hidden="true" />
          日报
        </h2>
        {view && <time dateTime={view.date}>{view.date}</time>}
      </header>
      {current && preparation && !preparation.provider && (
        <p className="daily-report-meta">请先配置默认AI服务。</p>
      )}
      {current && preparation?.materialCount === 0 && (
        <p className="daily-report-meta">当天没有可用于日报的任务。</p>
      )}
      {saved && (
        <>
          <textarea
            className="main-list-editor daily-report-editor"
            aria-label="日报正文"
            value={draft.text}
            rows={Math.min(16, Math.max(6, draft.text.split('\n').length + 1))}
            onChange={(event) => report.change(event.currentTarget.value)}
            onCompositionStart={report.onCompositionStart}
            onCompositionEnd={(event) => report.onCompositionEnd(event.currentTarget.value)}
            onBlur={() => void report.save()}
          />
        </>
      )}
      <div className="daily-report-actions">
        {(saved || phase) && (
          <p className="daily-report-meta daily-report-details">
            {saved && (
              <span className="daily-report-snapshot">
                <span>来自{saved.materialCount}条任务</span>
                {preparation?.provider && <span>{preparation.provider}</span>}
                <span>
                  <CalendarClock size={12} aria-label="最近保存时间" />
                  {localTime(
                    saved.savedAt,
                    new Date(saved.savedAt).toLocaleDateString() !== new Date().toLocaleDateString()
                  )}
                </span>
              </span>
            )}
            {phase && <span role="status">{report.phaseMessage}</span>}
            {report.saving && <span aria-live="polite">保存中…</span>}
          </p>
        )}
        {saved && (
          <Button
            variant="outline"
            disabled={!draft.text.trim()}
            onClick={() => void report.copy()}
          >
            复制全文
          </Button>
        )}
        {(phase || (current && preparation?.provider)) && (
          <Button
            className="daily-report-generate"
            data-cancel={phase ? '' : undefined}
            variant={phase || saved ? 'outline' : 'default'}
            disabled={phase === 'cancelling'}
            aria-disabled={!phase && !canGenerate}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              if (phase) void report.cancel()
              else if (canGenerate) void report.generate(event.currentTarget)
            }}
          >
            {phase ? '取消' : saved ? '重新生成' : '生成日报'}
          </Button>
        )}
        {current && ((preparation && !preparation.provider) || report.settingsRequired) && (
          <Button variant="outline" onClick={openSettings}>
            前往AI设置
          </Button>
        )}
      </div>
      {error && (
        <p className="daily-report-error" role="alert">
          {error}
        </p>
      )}
      {saveError && (
        <div className="daily-report-actions">
          <p className="daily-report-error" role="alert">
            {saveError}
          </p>
          <Button variant="outline" onClick={() => void report.retry()}>
            重试保存
          </Button>
        </div>
      )}
    </section>
  )
}

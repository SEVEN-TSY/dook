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
  const scope = preparation?.includeMultiDay
    ? '今天任务、符合范围的多天任务及进度、未完成子事项正文'
    : '仅今天任务'
  return (
    <section className="daily-report task-card-group" aria-labelledby="daily-report-heading">
      <header className="daily-report-header">
        <h2 id="daily-report-heading" tabIndex={-1} ref={report.heading}>
          日报
        </h2>
        {view && <time dateTime={view.date}>{view.date}</time>}
      </header>
      {current && preparation?.provider && (
        <p className="daily-report-meta">
          服务商 {preparation.provider} · 发送范围 {scope}
        </p>
      )}
      {current && preparation && !preparation.provider && (
        <p className="daily-report-meta">请先配置默认AI服务。</p>
      )}
      {current && preparation?.materialCount === 0 && (
        <p className="daily-report-meta">当天没有可用于日报的任务。</p>
      )}
      {saved && (
        <>
          <textarea
            className="daily-report-editor"
            aria-label="日报正文"
            value={draft.text}
            rows={Math.min(16, Math.max(6, draft.text.split('\n').length + 1))}
            onChange={(event) => report.change(event.currentTarget.value)}
            onCompositionStart={report.onCompositionStart}
            onCompositionEnd={(event) => report.onCompositionEnd(event.currentTarget.value)}
            onBlur={() => void report.save()}
          />
          <p className="daily-report-meta" aria-live="polite">
            {saved.includeMultiDay ? '今天任务及多天任务' : '仅今天任务'}
            {' · '}截至 {localTime(saved.cutoff, saved.date !== view?.today)}
            {' · '}
            {saved.materialCount}项材料
            {' · '}已保存{' '}
            {localTime(
              saved.savedAt,
              new Date(saved.savedAt).toLocaleDateString() !== new Date().toLocaleDateString()
            )}
            {report.saving && ' · 保存中…'}
          </p>
        </>
      )}
      <div className="daily-report-actions">
        {saved && (
          <Button
            variant="outline"
            disabled={!draft.text.trim()}
            onClick={() => void report.copy()}
          >
            复制全文
          </Button>
        )}
        {current && preparation?.provider && (
          <Button
            variant={saved ? 'outline' : 'default'}
            aria-disabled={
              !!phase || (preparation.materialCount === 0 && !preparation.hasHiddenMultiDay)
            }
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              if (!phase && (preparation.materialCount || preparation.hasHiddenMultiDay))
                void report.generate(event.currentTarget)
            }}
          >
            {saved ? '重新生成' : '生成日报'}
          </Button>
        )}
        {current && ((preparation && !preparation.provider) || report.settingsRequired) && (
          <Button variant="outline" onClick={openSettings}>
            前往AI设置
          </Button>
        )}
        {phase && (
          <>
            <span role="status">
              {phase === 'preparing'
                ? '正在准备…'
                : phase === 'generating'
                  ? '正在生成…'
                  : '正在取消…'}
            </span>
            <Button
              variant="outline"
              disabled={phase === 'cancelling'}
              onClick={() => void report.cancel()}
            >
              取消
            </Button>
          </>
        )}
        {report.copied && <span role="status">已复制</span>}
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

import { useEffect, useRef, useState } from 'react'
import type {
  DailyReport,
  DailyReportPreparation,
  DailyReportView
} from '../../../../shared/daily-report'
import { hiddenMultiDayWarning } from '../../../../shared/daily-report'
import { useDeleteConfirmation } from '../../components/DeleteConfirmation'
import { toastError } from '../../components/notify'
import { getDesktopApi, unwrap } from '../../platform/desktop'
import { useSerialSave } from '../shared/useSerialSave'

interface Draft {
  report: DailyReport | null
  text: string
  dirty: boolean
}

const message = (error: unknown) =>
  error instanceof Error ? error.message : '日报操作失败，请重试。'

export function useDailyReport(enabled: boolean, visible: boolean, includeMultiDay: boolean) {
  const confirmation = useDeleteConfirmation()
  const [open, setOpen] = useState(false)
  const [focusRevision, setFocusRevision] = useState(0)
  const focusedRevision = useRef(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const [view, setView] = useState<DailyReportView | null>(null)
  const [preparation, setPreparation] = useState<DailyReportPreparation | null>(null)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [settingsRequired, setSettingsRequired] = useState(false)
  const [copied, setCopied] = useState(false)
  const [phase, setPhase] = useState<'preparing' | 'generating' | 'cancelling' | null>(null)
  const current = useRef<Draft>({ report: null, text: '', dirty: false })
  const [draft, setDraft] = useState(current.current)
  const active = useRef<symbol | null>(null)
  const cancelling = useRef(false)
  const editVersion = useRef(0)
  const timer = useRef<number | null>(null)
  const redraw = () => setDraft({ ...current.current })
  const adopt = (report: DailyReport | null) => {
    current.current = { report, text: report?.body ?? '', dirty: false }
    redraw()
    setSaveError('')
    setCopied(false)
  }
  const serial = useSerialSave(
    current,
    async (draft) => {
      if (!draft.report || !draft.dirty) return 'done'
      const text = draft.text
      const report = unwrap(await getDesktopApi().reportSave(draft.report.date, text))
      draft.report = report
      draft.dirty = draft.text !== text
      redraw()
      setSaveError('')
      return draft.dirty ? 'continue' : 'done'
    },
    setSaveError,
    '日报保存失败，请重试。'
  )
  const save = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    return current.current.dirty || serial.composing.current || serial.pending.current
      ? serial.save()
      : Promise.resolve(true)
  }
  const latest = useRef({ save, view, adopt })
  latest.current = { save, view, adopt }
  const reload = useRef(async () => {})
  useEffect(() => {
    if (!enabled) return
    const api = getDesktopApi()
    let mounted = true
    let version = 0
    const refresh = async () => {
      const request = ++version
      try {
        const next = unwrap(await api.reportView())
        if (!mounted || request !== version) return
        if (latest.current.view?.date !== next.date) {
          if (!(await latest.current.save()) || !mounted || request !== version) return
          latest.current.adopt(next.report)
        } else if (!current.current.report && next.report) {
          latest.current.adopt(next.report)
        }
        setView(next)
      } catch (error) {
        if (mounted && request === version) setError(message(error))
      }
    }
    reload.current = refresh
    void refresh()
    const unsubscribe = api.onTasksChanged(() => void refresh())
    const unsubscribeStage = api.onDailyReportGenerating(() => {
      if (active.current) setPhase((phase) => (phase === 'preparing' ? 'generating' : phase))
    })
    return () => {
      mounted = false
      unsubscribe()
      unsubscribeStage()
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || !open || !visible) return
    let mounted = true
    let version = 0
    const api = getDesktopApi()
    const refresh = async () => {
      const request = ++version
      try {
        const next = unwrap(await api.reportPrepare())
        if (mounted && request === version) setPreparation(next)
      } catch (error) {
        if (mounted && request === version) {
          setSettingsRequired(true)
          toastError(message(error), { duration: 4000 })
        }
      }
    }
    void refresh()
    const unsubscribe = api.onTasksChanged(() => void refresh())
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [enabled, open, visible, includeMultiDay])

  useEffect(() => {
    if (!visible || focusRevision === focusedRevision.current || !heading.current) return
    focusedRevision.current = focusRevision
    heading.current.scrollIntoView({ block: 'start', behavior: 'instant' })
    heading.current.focus({ preventScroll: true })
  }, [visible, focusRevision])

  const reveal = () => {
    setOpen(true)
    setFocusRevision((revision) => revision + 1)
  }
  const announceEdit = () => {
    const report = current.current.report
    if (!report) return
    editVersion.current++
    void getDesktopApi()
      .reportBeginEdit(report.date)
      .then(unwrap)
      .catch((error) => setSaveError(message(error)))
  }
  const change = (text: string) => {
    announceEdit()
    current.current.text = text
    current.current.dirty = text !== current.current.report?.body
    redraw()
    setCopied(false)
    if (timer.current !== null) window.clearTimeout(timer.current)
    if (!serial.composing.current) timer.current = window.setTimeout(() => void save(), 350)
  }
  const generate = async (trigger: HTMLButtonElement) => {
    if (active.current || !preparation || !view || view.date !== view.today) return
    const command = Symbol()
    const startedAt = editVersion.current
    active.current = command
    cancelling.current = false
    const api = getDesktopApi()
    setError('')
    setSettingsRequired(false)
    setCopied(false)
    setPhase('preparing')
    try {
      await save()
      if (cancelling.current) return
      const scope = unwrap(await api.reportPrepare())
      if (cancelling.current) return
      setPreparation(scope)
      if (
        scope.date !== preparation.date ||
        scope.configuration !== preparation.configuration ||
        scope.includeMultiDay !== preparation.includeMultiDay
      ) {
        await reload.current()
        setError('日期、发送范围或默认AI配置已变更，请确认后重新生成。')
        return
      }
      let confirmed = false
      if (scope.hasHiddenMultiDay) {
        confirmed = await confirmation.confirm(
          {
            title: '继续生成日报？',
            description: hiddenMultiDayWarning,
            confirmLabel: '确定',
            focusAfterConfirm: () => heading.current
          },
          trigger
        )
        if (!confirmed || cancelling.current) return
      }
      const result = unwrap(
        await api.reportGenerate(scope, confirmed, startedAt !== editVersion.current)
      )
      if (active.current !== command) return
      if (result.kind === 'prepare') {
        setPreparation(result.preparation)
        await reload.current()
        setError('生成条件已变更，请确认后重新生成。')
      } else if (result.kind === 'saved' && startedAt === editVersion.current) {
        adopt(result.report)
      }
    } catch (error) {
      if (active.current === command) {
        const detail = message(error)
        setSettingsRequired(/AI配置|默认AI服务|API Key|凭证|余额/u.test(detail))
        if (/AI|API Key|凭证/u.test(detail)) toastError(detail, { duration: 4000 })
        else setError(detail)
      }
    } finally {
      if (active.current === command) {
        active.current = null
        setPhase(null)
      }
    }
  }
  const cancel = async () => {
    if (!active.current) return
    cancelling.current = true
    confirmation.cancel()
    setPhase('cancelling')
    try {
      unwrap(await getDesktopApi().reportCancel())
    } catch (error) {
      setError(message(error))
    }
  }
  const copy = async () => {
    const { report, text } = current.current
    if (!report || !text.trim()) return
    try {
      unwrap(await getDesktopApi().reportCopy(report.date, text))
      setCopied(true)
    } catch (error) {
      setError(message(error))
    }
  }
  return {
    open,
    reveal,
    heading,
    view,
    draft,
    preparation,
    phase,
    error,
    saveError,
    settingsRequired,
    copied,
    generate,
    cancel,
    copy,
    save,
    change,
    saving: serial.saving,
    onCompositionStart: () => {
      announceEdit()
      serial.composing.current = true
    },
    onCompositionEnd: (text: string) => {
      if (text !== current.current.text) change(text)
      else announceEdit()
      serial.endComposition()
      void save()
    },
    retry: async () => {
      if (await save()) await reload.current()
    }
  }
}

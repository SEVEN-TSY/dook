import { toast } from 'sonner'
import { useRef, useState } from 'react'
import type { Task } from '../../../../shared/contracts'
import { getDesktopApi, unwrap } from '../../platform/desktop'
import { useSerialSave } from '../shared/useSerialSave'

interface InputSession {
  creating: boolean
  id?: string
  date?: string
  kind?: Task['kind']
  text: string
  saved: string
  observed?: boolean
  cancelled?: boolean
}

/** 串行追赶保存期间的新输入，全部成功后结束输入，失败时保留内容。 */
export function useTaskInput(
  date: string | undefined,
  changed: () => Promise<void>,
  report: (message: string) => void,
  finished?: () => void
) {
  const session = useRef<InputSession>({ creating: true, text: '', saved: '' })
  const [, render] = useState(0)
  const redraw = () => render((value) => value + 1)
  const start = (task?: Task) => {
    session.current = {
      creating: !task,
      id: task?.id,
      date,
      kind: task?.kind,
      text: task?.description ?? '',
      saved: task?.description ?? ''
    }
    redraw()
  }
  const setValue = (text: string) => {
    session.current.text = text
    session.current.date ??= date
    redraw()
  }
  const { save, saving, pending, composing, endComposition } = useSerialSave(
    session,
    async (current) => {
      if (current.cancelled) return 'done'
      const text = current.text.trim()
      if (!text) {
        if (!current.creating) {
          report('任务描述不能为空。')
          return 'blocked'
        }
        if (current.creating && current.id) start()
        return 'done'
      }
      if (text === current.saved) {
        start()
        finished?.()
        return 'done'
      }
      if (current.date !== date && current.kind !== 'multi-day')
        throw new Error('日期已切换，请重新记录今天任务。未保存的输入仍保留。')
      const api = getDesktopApi()
      const task = unwrap(
        await (current.id ? api.updateTask(current.id, text) : api.createTask(text, current.date))
      )
      toast.success(current.id ? '任务已保存' : '任务已添加')
      current.id = task.id
      current.saved = task.description
      report('')
      redraw()
      await changed()
      return 'continue'
    },
    report,
    '保存失败，请重试。'
  )
  const submit = async () => {
    if (!session.current.text.trim()) {
      report('任务描述不能为空。')
      return false
    }
    return save()
  }
  const cancel = async () => {
    const current = session.current
    current.cancelled = true
    if (pending.current) await pending.current
    if (session.current === current) start()
    report('')
  }
  const reconcile = (tasks: Task[]) => {
    const current = session.current
    if (!current.id) return
    if (tasks.some((task) => task.id === current.id)) current.observed = true
    else if (current.observed && !pending.current && current.text.trim() === current.saved) start()
  }
  return {
    value: session.current.text,
    saving,
    start,
    setValue,
    save,
    submit,
    cancel,
    composing,
    endComposition,
    reconcile
  }
}

import { useRef, useState } from 'react'
import type { Task } from '../../../../shared/contracts'
import { getDesktopApi, unwrap } from '../../platform/desktop'

interface InputSession {
  id?: string
  date?: string
  text: string
  saved: string
  observed?: boolean
  cancelled?: boolean
}

/** 一轮输入绑定一个真实任务；串行保存并追赶保存过程中产生的新输入。 */
export function useTaskInput(
  date: string | undefined,
  changed: () => Promise<void>,
  report: (message: string) => void
) {
  const session = useRef<InputSession>({ text: '', saved: '' })
  const pending = useRef<Promise<boolean> | null>(null)
  const composing = useRef(false)
  const compositionSave = useRef(false)
  const [, render] = useState(0)
  const redraw = () => render((value) => value + 1)
  const start = (task?: Task) => {
    session.current = {
      id: task?.id,
      date,
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
  const save = (): Promise<boolean> => {
    if (pending.current) return pending.current
    if (composing.current) {
      compositionSave.current = true
      return Promise.resolve(false)
    }
    const current = session.current
    const persist = async () => {
      try {
        while (session.current === current) {
          if (current.cancelled) return true
          if (composing.current) {
            compositionSave.current = true
            return false
          }
          const text = current.text.trim()
          if (!text || text === current.saved) return true
          if (current.date !== date)
            throw new Error('日期已切换，请重新记录今天任务。未保存的输入仍保留。')
          const api = getDesktopApi()
          const task = unwrap(
            await (current.id
              ? api.updateTask(current.id, text)
              : api.createTask(text, current.date))
          )
          current.id = task.id
          current.saved = task.description
          report('')
          redraw()
          await changed()
        }
        return true
      } catch (error) {
        report(error instanceof Error ? error.message : '保存失败，请重试。')
        return false
      }
    }
    pending.current = persist().finally(() => {
      pending.current = null
      redraw()
    })
    return pending.current
  }
  const submit = async () => {
    if (await save()) {
      if (!session.current.text.trim()) {
        report('任务描述不能为空。')
        return false
      }
      start()
      return true
    }
    return false
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
  const endComposition = () => {
    composing.current = false
    if (compositionSave.current) {
      compositionSave.current = false
      void save()
    }
  }
  return {
    value: session.current.text,
    id: session.current.id,
    saved:
      !pending.current &&
      Boolean(session.current.id) &&
      session.current.text.trim() === session.current.saved,
    saving: Boolean(pending.current),
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

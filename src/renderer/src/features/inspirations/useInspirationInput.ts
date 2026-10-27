import { useRef, useState } from 'react'

interface InputSession {
  key: string
  id?: string
  text: string
  saved: string
}

/** 一轮草稿固定标识，串行保存并追赶等待期间继续输入的内容。 */
export function useInspirationInput(
  persist: (
    text: string,
    id: string | undefined,
    key: string
  ) => Promise<{ id: string; description: string }>,
  changed: () => Promise<void>,
  report: (message: string) => void,
  finished?: () => void
) {
  const session = useRef<InputSession>({ key: crypto.randomUUID(), text: '', saved: '' })
  const pending = useRef<Promise<boolean> | null>(null)
  const composing = useRef(false)
  const compositionSave = useRef(false)
  const [, render] = useState(0)
  const redraw = () => render((value) => value + 1)
  const start = (value?: { id: string; description: string }) => {
    session.current = {
      key: crypto.randomUUID(),
      id: value?.id,
      text: value?.description ?? '',
      saved: value?.description ?? ''
    }
    redraw()
  }
  const setValue = (value: string) => {
    session.current.text = value
    redraw()
  }
  const save = (): Promise<boolean> => {
    if (pending.current) return pending.current
    if (composing.current) {
      compositionSave.current = true
      return Promise.resolve(false)
    }
    const current = session.current
    const run = async () => {
      try {
        while (session.current === current) {
          if (composing.current) {
            compositionSave.current = true
            return false
          }
          const text = current.text.trim()
          if (!text) {
            if (current.id) {
              report('灵感内容不能为空。')
              return false
            }
            return true
          }
          if (text === current.saved) {
            start()
            finished?.()
            return true
          }
          const saved = await persist(text, current.id, current.key)
          current.id = saved.id
          current.saved = saved.description
          report('')
          redraw()
          await changed()
        }
        return true
      } catch (error) {
        report(error instanceof Error ? error.message : '保存灵感失败，请重试。')
        return false
      }
    }
    pending.current = run().finally(() => {
      pending.current = null
      redraw()
    })
    return pending.current
  }
  const submit = () => {
    if (!session.current.text.trim()) {
      report('灵感内容不能为空。')
      return Promise.resolve(false)
    }
    return save()
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
    saving: Boolean(pending.current),
    start,
    setValue,
    save,
    submit,
    composing,
    endComposition
  }
}

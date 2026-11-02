import { useRef, useState } from 'react'
import { useSerialSave } from '../shared/useSerialSave'

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
  const { save, saving, composing, endComposition } = useSerialSave(
    session,
    async (current) => {
      const text = current.text.trim()
      if (!text) {
        if (current.id) {
          report('小记内容不能为空。')
          return 'blocked'
        }
        return 'done'
      }
      if (text === current.saved) {
        start()
        finished?.()
        return 'done'
      }
      const saved = await persist(text, current.id, current.key)
      current.id = saved.id
      current.saved = saved.description
      report('')
      redraw()
      await changed()
      return 'continue'
    },
    report,
    '保存小记失败，请重试。'
  )
  const submit = () => {
    if (!session.current.text.trim()) {
      report('小记内容不能为空。')
      return Promise.resolve(false)
    }
    return save()
  }
  return {
    value: session.current.text,
    saving,
    start,
    setValue,
    save,
    submit,
    composing,
    endComposition
  }
}

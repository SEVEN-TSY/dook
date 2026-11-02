import { useRef, useState } from 'react'
import type { Habit } from '../../../../shared/contracts'
import { getDesktopApi, unwrap } from '../../platform/desktop'
import { useSerialSave } from '../shared/useSerialSave'

export function useHabitEdit(report: (message: string) => void, updated: (habit: Habit) => void) {
  const session = useRef<{ id: string | null; text: string; saved: string }>({
    id: null,
    text: '',
    saved: ''
  })
  const [, render] = useState(0)
  const redraw = () => render((value) => value + 1)
  const start = (habit?: Habit) => {
    session.current = {
      id: habit?.id ?? null,
      text: habit?.description ?? '',
      saved: habit?.description ?? ''
    }
    redraw()
  }
  const setValue = (text: string) => {
    session.current.text = text
    redraw()
  }
  const serial = useSerialSave(
    session,
    async (draft) => {
      if (!draft.id) return 'done'
      const text = draft.text.trim()
      if (!text) {
        report('习惯描述不能为空。')
        return 'blocked'
      }
      if (text === draft.saved) {
        start()
        return 'done'
      }
      const habit = unwrap(await getDesktopApi().updateHabit(draft.id, text))
      draft.saved = habit.description
      updated(habit)
      report('')
      return 'continue'
    },
    report,
    '习惯保存失败，请重试。'
  )
  return {
    ...serial,
    id: session.current.id,
    value: session.current.text,
    start,
    setValue,
    submit: serial.save
  }
}

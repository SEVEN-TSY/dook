import { useEffect, useRef, useState } from 'react'
import type { Habit } from '../../../../shared/contracts'
import { getDesktopApi, unwrap } from '../../platform/desktop'

interface Props {
  onSaveReady: (save: () => Promise<boolean>) => () => void
}

export function HabitsPanel({ onSaveReady }: Props) {
  const [habits, setHabits] = useState<Habit[]>([])
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const text = useRef('')
  const pending = useRef<Promise<boolean> | null>(null)
  const composing = useRef(false)
  const saveAfterComposition = useRef(false)
  const save = useRef(async () => true)
  save.current = () => {
    if (pending.current) return pending.current
    if (!text.current.trim()) return Promise.resolve(true)
    if (composing.current) {
      saveAfterComposition.current = true
      return Promise.resolve(false)
    }
    const description = text.current.trim()
    setBusy(true)
    pending.current = (async () => {
      try {
        unwrap(await getDesktopApi().createHabit(description))
        text.current = ''
        setValue('')
        setError('')
        return true
      } catch (error) {
        setError(error instanceof Error ? error.message : '习惯保存失败，请重试。')
        return false
      } finally {
        pending.current = null
        setBusy(false)
      }
    })()
    return pending.current
  }
  useEffect(() => onSaveReady(() => save.current()), [onSaveReady])
  useEffect(() => {
    let active = true
    let request = 0
    const refresh = async () => {
      const version = ++request
      try {
        const result = unwrap(await getDesktopApi().listHabits())
        if (active && version === request) setHabits(result)
      } catch (error) {
        if (active && version === request)
          setError(error instanceof Error ? error.message : '读取习惯失败。')
      }
    }
    const unsubscribe = getDesktopApi().onTasksChanged(() => {
      void refresh()
    })
    void refresh()
    return () => {
      active = false
      unsubscribe()
    }
  }, [])
  return (
    <section className="habits-panel" aria-label="习惯管理">
      <h2>
        习惯 <span>{habits.length}</span>
      </h2>
      <p className="habit-hint">每天自动放入今天任务</p>
      {habits.length === 0 && <p className="habit-hint">把固定工作记成习惯。</p>}
      <ul className="habit-list">
        {habits.map((habit) => (
          <li key={habit.id} data-habit-id={habit.id}>
            {habit.description}
          </li>
        ))}
      </ul>
      <form
        className="habit-add"
        onSubmit={(event) => {
          event.preventDefault()
          if (!text.current.trim()) {
            setError('习惯描述不能为空。')
            return
          }
          void save.current()
        }}
      >
        <input
          data-testid="habit-new"
          aria-label="新增习惯描述"
          placeholder="记下一项固定工作"
          value={value}
          disabled={busy}
          onChange={(event) => {
            text.current = event.target.value
            setValue(event.target.value)
          }}
          onBlur={() => {
            void save.current()
          }}
          onCompositionStart={() => {
            composing.current = true
          }}
          onCompositionEnd={() => {
            composing.current = false
            if (saveAfterComposition.current) {
              saveAfterComposition.current = false
              void save.current()
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229))
              event.preventDefault()
          }}
        />
        <button type="submit" disabled={busy}>
          添加习惯
        </button>
      </form>
      {error && (
        <p className="task-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

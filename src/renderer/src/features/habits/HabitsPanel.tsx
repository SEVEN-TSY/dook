import { AppIcon } from '../../components/AppIcon'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/button'
import { InlineComposer } from '../shared/InlineComposer'
import type { Habit } from '../../../../shared/contracts'
import { getDesktopApi, unwrap } from '../../platform/desktop'

interface Props {
  onSaveReady: (save: () => Promise<boolean>) => () => void
  composerOpen: boolean
  onComposerOpenChange: (open: boolean) => void
}

export function HabitsPanel({ onSaveReady, composerOpen, onComposerOpenChange }: Props) {
  const [habits, setHabits] = useState<Habit[]>([])
  const [value, setValue] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const text = useRef('')
  const editing = useRef<string | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const pending = useRef<Promise<boolean> | null>(null)
  const composing = useRef(false)
  const saveAfterComposition = useRef(false)
  const save = useRef(async () => true)
  const clear = () => {
    editing.current = null
    text.current = ''
    setEditingId(null)
    setValue('')
  }
  save.current = () => {
    if (pending.current) return pending.current
    if (composing.current) {
      saveAfterComposition.current = true
      return Promise.resolve(false)
    }
    if (!text.current.trim()) {
      if (editing.current) {
        setError('习惯描述不能为空。')
        return Promise.resolve(false)
      }
      return Promise.resolve(true)
    }
    const description = text.current.trim()
    const id = editing.current
    setBusy(true)
    pending.current = (async () => {
      try {
        const api = getDesktopApi()
        unwrap(await (id ? api.updateHabit(id, description) : api.createHabit(description)))
        clear()
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
  useEffect(() => {
    if (composerOpen) field.current?.focus()
  }, [composerOpen])
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
  const edit = async (habit: Habit) => {
    if (!(await save.current())) return
    editing.current = habit.id
    text.current = habit.description
    setEditingId(habit.id)
    setValue(habit.description)
    setError('')
    onComposerOpenChange(true)
    requestAnimationFrame(() => field.current?.focus())
  }
  const remove = async (id: string) => {
    if (pending.current && !(await pending.current)) return
    if (editing.current && editing.current !== id && !(await save.current())) return
    setBusy(true)
    try {
      if (unwrap(await getDesktopApi().deleteHabit(id))) {
        if (editing.current === id) clear()
        setError('')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '删除习惯失败。')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="habits-panel" aria-label="习惯管理">
      <h2>
        全部习惯 <span>{habits.length}</span>
      </h2>
      <p className="habit-hint">每天自动放入今天任务</p>
      <InlineComposer
        ref={field}
        expanded={composerOpen}
        tone="habit"
        data-testid={editingId ? 'habit-edit-input' : 'habit-new'}
        aria-label={editingId ? '编辑习惯描述' : '新增习惯描述'}
        placeholder={editingId ? '修改固定工作…' : '记下一项每天重复的工作…'}
        value={value}
        disabled={busy}
        saving={busy}
        submitLabel={editingId ? '保存修改' : '添加习惯'}
        onValueChange={(value) => {
          text.current = value
          setValue(value)
        }}
        onSubmit={async () => {
          if (await save.current()) {
            requestAnimationFrame(() => {
              if (field.current?.checkVisibility()) field.current.focus()
            })
          }
        }}
        onBlur={() => {
          if (composerOpen) void save.current()
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
      />
      {habits.length === 0 && (
        <div className="workbench-empty">
          <span className="empty-icon">
            <AppIcon name="habit" />
          </span>
          <strong>把重复的事交给习惯</strong>
          <span>新增习惯后，每天自动生成一项今天任务</span>
        </div>
      )}
      <ul className="habit-list">
        {habits.map((habit) => (
          <li key={habit.id} data-habit-id={habit.id}>
            <span className="habit-symbol">
              <AppIcon name="habit" />
            </span>
            <span data-testid="habit-description">{habit.description}</span>
            <small className="habit-frequency">每天</small>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              data-testid="habit-edit"
              disabled={busy}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void edit(habit)}
              aria-label={`编辑习惯：${habit.description}`}
            >
              编辑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              data-testid="habit-delete"
              disabled={busy}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void remove(habit.id)}
              aria-label={`删除习惯：${habit.description}`}
            >
              删除
            </Button>
          </li>
        ))}
      </ul>

      {error && (
        <p className="task-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

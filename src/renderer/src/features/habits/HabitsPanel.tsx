import { HabitSchedulePopover } from './HabitSchedulePopover'
import { CreatedTime } from '../shared/CreatedTime'
import { Archive, RotateCcw, Trash2 } from 'lucide-react'
import { Toast } from '../../components/Toast'
import { AppIcon } from '../../components/AppIcon'
import { useDeleteConfirmation } from '../../components/DeleteConfirmation'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/button'
import { InlineComposer } from '../shared/InlineComposer'
import { ListDescription } from '../shared/ListDescription'
import { useHabitEdit } from './useHabitEdit'
import type { Habit } from '../../../../shared/contracts'
import { getDesktopApi, unwrap } from '../../platform/desktop'

interface Props {
  onSaveReady: (save: () => Promise<boolean>) => () => void
  onCountsChange: (counts: { current: number; archived: number }) => void
  archiveView: boolean
  composerOpen: boolean
  onComposerOpenChange: (open: boolean) => void
}

export function HabitsPanel({
  onSaveReady,
  composerOpen,
  onComposerOpenChange,
  archiveView,
  onCountsChange
}: Props) {
  const deletion = useDeleteConfirmation()
  const [habits, setHabits] = useState<Habit[]>([])
  const [archivedHabits, setArchivedHabits] = useState<Habit[]>([])
  useEffect(() => {
    onCountsChange({ current: habits.length, archived: archivedHabits.length })
  }, [habits.length, archivedHabits.length, onCountsChange])
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const text = useRef('')
  const field = useRef<HTMLTextAreaElement>(null)
  const pending = useRef<Promise<boolean> | null>(null)
  const composing = useRef(false)
  const saveAfterComposition = useRef(false)
  const save = useRef(async () => true)
  const edited = useHabitEdit(setError, (habit) => {
    setHabits((current) => current.map((item) => (item.id === habit.id ? habit : item)))
    setSuccess('习惯已更新')
  })
  const flush = useRef(async () => true)
  flush.current = async () => (await save.current()) && (await edited.save())
  const clear = () => {
    text.current = ''
    setValue('')
  }
  save.current = () => {
    if (pending.current) return pending.current
    if (composing.current) {
      saveAfterComposition.current = true
      return Promise.resolve(false)
    }
    if (!text.current.trim()) {
      return Promise.resolve(true)
    }
    const description = text.current.trim()
    setBusy(true)
    pending.current = (async () => {
      try {
        const api = getDesktopApi()
        unwrap(await api.createHabit(description))
        clear()
        setError('')
        setSuccess('习惯已创建')
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
    if (composerOpen) {
      requestAnimationFrame(() => field.current?.focus())
    }
  }, [composerOpen])
  useEffect(() => onSaveReady(() => flush.current()), [onSaveReady])
  useEffect(() => {
    let active = true
    let request = 0
    const refresh = async () => {
      const version = ++request
      try {
        const api = getDesktopApi()
        const [result, archived] = await Promise.all([api.listHabits(), api.listArchivedHabits()])
        const current = unwrap(result)
        const archive = unwrap(archived)
        if (active && version === request) {
          setHabits(current)
          setArchivedHabits(archive)
        }
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
    if (edited.id === habit.id) return
    if (!(await flush.current())) return
    edited.start(habit)
    setError('')
  }
  const act = async (habit: Habit, action: 'archive' | 'restore' | 'delete') => {
    if (busy || !(await flush.current())) return
    setBusy(true)
    try {
      const api = getDesktopApi()
      if (action === 'delete') {
        if (
          !(await deletion.confirm({
            title: '永久删除习惯',
            description: '永久删除这个习惯？',
            detail: `${habit.description}。习惯将被永久删除，无法恢复，历史任务保留。`
          }))
        )
          return
        unwrap(await api.deleteArchivedHabit(habit.id))
      } else if (action === 'archive') {
        unwrap(await api.archiveHabit(habit.id))
      } else {
        unwrap(await api.restoreHabit(habit.id))
      }
      setError('')
      setSuccess({ archive: '习惯已归档', restore: '习惯已恢复', delete: '习惯已永久删除' }[action])
    } catch (error) {
      setError(error instanceof Error ? error.message : '习惯操作失败，请重试。')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="habits-panel" aria-label="习惯管理">
      <InlineComposer
        ref={field}
        expanded={composerOpen && !archiveView}
        onDismiss={async () => {
          if (await save.current()) onComposerOpenChange(false)
        }}
        tone="habit"
        data-testid="habit-new"
        aria-label="新增习惯描述"
        placeholder="记下一项每天重复的工作…"
        value={value}
        disabled={busy}
        saving={busy}
        submitLabel="添加习惯"
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
      {!archiveView && habits.length === 0 && (
        <div className="workbench-empty">
          <span className="empty-icon">
            <AppIcon name="habit" />
          </span>
          <strong>把重复的事交给习惯</strong>
          <span>新增习惯后，每天自动生成一项今天任务</span>
        </div>
      )}
      {archiveView && archivedHabits.length === 0 && (
        <p className="inspiration-empty">还没有已归档习惯。</p>
      )}
      <ul className="habit-list">
        {(archiveView ? archivedHabits : habits).map((habit) => (
          <li key={habit.id} data-habit-id={habit.id} className="main-list-row">
            <div className="habit-description">
              {archiveView ? (
                <span className="habit-archived-description" title={habit.description}>
                  {habit.description}
                </span>
              ) : (
                <ListDescription
                  description={habit.description}
                  editing={edited.id === habit.id}
                  draft={edited}
                  onEdit={() => edit(habit)}
                  label="编辑习惯描述"
                  testId="habit-edit-input"
                  previewTestId="habit-description"
                />
              )}
              <p className="list-meta">
                <CreatedTime value={habit.createdAt} />
              </p>
            </div>
            <div className="main-list-actions">
              {archiveView ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="恢复习惯"
                    aria-label="恢复习惯"
                    data-testid="habit-restore"
                    disabled={busy}
                    onClick={() => void act(habit, 'restore')}
                  >
                    <RotateCcw size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="永久删除习惯"
                    aria-label="永久删除习惯"
                    data-testid="habit-delete"
                    disabled={busy}
                    onClick={() => void act(habit, 'delete')}
                  >
                    <Trash2 size={15} />
                  </Button>
                </>
              ) : (
                <>
                  <HabitSchedulePopover
                    habit={habit}
                    disabled={busy}
                    beforeOpen={() => flush.current()}
                    onSaved={(updated) => {
                      setHabits((current) =>
                        current.map((item) => (item.id === updated.id ? updated : item))
                      )
                      setError('')
                      setSuccess('定时周期已保存')
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="归档习惯"
                    aria-label={`归档习惯：${habit.description}`}
                    data-testid="habit-archive"
                    disabled={busy}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void act(habit, 'archive')}
                  >
                    <Archive size={15} />
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Toast
        message={error || success}
        error={Boolean(error)}
        onDismiss={() => {
          setError('')
          setSuccess('')
        }}
      />
    </section>
  )
}

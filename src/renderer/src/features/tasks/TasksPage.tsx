import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { DesktopState, WindowKind } from '../../../../shared/contracts'
import { getDesktopApi, unwrap } from '../../platform/desktop'
import { SubitemsPanel } from './SubitemsPanel'
import { useTasks } from './useTasks'
import { useTaskInput } from './useTaskInput'
import { HabitsPanel } from '../habits/HabitsPanel'
import { InspirationPanel } from '../inspirations/InspirationPanel'
import type { InspirationPanelHandle } from '../inspirations/InspirationPanel'
import { useInspirationInput } from '../inspirations/useInspirationInput'

function focusTaskEditor(element: HTMLTextAreaElement | null) {
  if (!element) return
  element.focus({ preventScroll: true })
  element.setSelectionRange(element.value.length, element.value.length)
}

export function TasksPage({
  kind,
  desktop,
  hidden,
  openSettings
}: {
  kind: WindowKind
  desktop: DesktopState | null
  hidden: boolean
  openSettings: () => void
}) {
  const { today, error, busy, setError, refresh, complete, remove, convert, progress, addHabit } =
    useTasks()
  const [newKind, setNewKind] = useState<'task' | 'inspiration'>('task')
  const taskAdded = useTaskInput(today?.date, refresh, setError)
  const inspirationAdded = useInspirationInput(
    async (text, id) =>
      unwrap(
        await (id
          ? getDesktopApi().updateInspiration(id, text)
          : getDesktopApi().createInspiration(text))
      ),
    async () => {},
    setError
  )
  const added = newKind === 'task' ? taskAdded : inspirationAdded
  const inspirationPanel = useRef<InspirationPanelHandle>(null)
  const [inspirationEditing, setInspirationEditing] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [inputFocused, setInputFocused] = useState(false)
  const [progressFocused, setProgressFocused] = useState(false)
  const edited = useTaskInput(today?.date, refresh, setError, () => {
    setEditing(null)
  })
  const habitSave = useRef(async () => true)
  const onHabitSaveReady = useCallback((save: () => Promise<boolean>) => {
    habitSave.current = save
    return () => {
      habitSave.current = async () => true
    }
  }, [])
  const subitemSaves = useRef(new Map<string, () => Promise<boolean>>())
  const subitemInteractions = useRef(new Set<string>())
  const [subitemEditing, setSubitemEditing] = useState(false)
  const onSubitemSaveReady = useCallback((id: string, save: () => Promise<boolean>) => {
    subitemSaves.current.set(id, save)
    return () => {
      subitemSaves.current.delete(id)
    }
  }, [])
  const onSubitemInteraction = useCallback((id: string, active: boolean) => {
    if (active) subitemInteractions.current.add(id)
    else subitemInteractions.current.delete(id)
    setSubitemEditing(subitemInteractions.current.size > 0)
  }, [])
  const flush = useRef(async () => true)
  const clickOutside = useRef((_target: EventTarget | null) => {})
  clickOutside.current = (target) => {
    const element = target instanceof Element ? target : null
    if (!element?.closest('[data-testid="task-new"]')) void added.save()
    if (!element?.closest('[data-testid="task-edit"]')) void edited.save()
  }
  flush.current = async () => {
    const results = await Promise.all([
      taskAdded.save(),
      inspirationAdded.save(),
      edited.save(),
      habitSave.current(),
      inspirationPanel.current?.save() ?? true,
      ...Array.from(subitemSaves.current.values(), (save) => save())
    ])
    return results.every(Boolean)
  }
  useEffect(() => {
    const api = getDesktopApi()
    const unsubscribe = api.onSaveRequested(() => flush.current())
    const onBlur = () => {
      void flush.current()
    }
    const onPointerDown = (event: PointerEvent) => clickOutside.current(event.target)
    window.addEventListener('blur', onBlur)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      unsubscribe()
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [])
  useEffect(() => {
    if (kind === 'note')
      void getDesktopApi().setInteraction(
        (inputFocused && Boolean(added.value.trim())) ||
          editing !== null ||
          inspirationEditing ||
          subitemEditing ||
          progressFocused
      )
  }, [
    kind,
    inputFocused,
    added.value,
    editing,
    inspirationEditing,
    subitemEditing,
    progressFocused
  ])
  useEffect(() => {
    if (today) taskAdded.reconcile(today.tasks)
    if (editing && today && !today.tasks.some((task) => task.id === editing)) {
      setEditing(null)
      void edited.cancel()
    }
  }, [today, editing])
  const add = async (event: FormEvent) => {
    event.preventDefault()
    await added.submit()
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (editing) await edited.submit()
  }
  const openOther = async () => {
    try {
      unwrap(await getDesktopApi().openWindow(kind === 'main' ? 'note' : 'main'))
    } catch (error) {
      setError(error instanceof Error ? error.message : '打开窗口失败。')
    }
  }
  const completed = today?.tasks.filter((task) => task.completed).length ?? 0
  const windowAction = async (action: () => Promise<unknown>) => {
    try {
      await action()
    } catch (error) {
      setError(error instanceof Error ? error.message : '窗口操作失败。')
    }
  }
  return (
    <section
      className={`tasks-page ${kind} ${desktop?.edge ? `docked-${desktop.edge}` : ''}`}
      hidden={hidden}
    >
      {kind === 'main' && (
        <div className="task-toolbar">
          <span className="task-brand">
            ✓ <strong>myTodo</strong>
          </span>
          <button
            data-testid="open-settings"
            onClick={async () => {
              if (await flush.current()) openSettings()
            }}
          >
            设置
          </button>
          <button data-testid="open-other" onClick={() => void openOther()}>
            {kind === 'main' ? '打开桌面便签' : '打开主界面'} <span aria-hidden="true">↗</span>
          </button>
        </div>
      )}
      <header
        className="task-heading"
        onPointerDown={(event) => {
          if (kind !== 'note' || event.button !== 0 || (event.target as Element).closest('button'))
            return
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          void windowAction(async () => unwrap(await getDesktopApi().setNoteDragging(true)))
        }}
        onPointerUp={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onLostPointerCapture={() => {
          if (kind === 'note')
            void windowAction(async () => unwrap(await getDesktopApi().setNoteDragging(false)))
        }}
      >
        <div>
          <p className="task-eyebrow">TODAY</p>
          <h1>今天</h1>
          <p className="task-date">{today?.date ?? '正在读取…'}</p>
        </div>
        <span className="task-count" aria-label="完成数量">
          {completed}
          <span> / {today?.tasks.length ?? 0}</span>
        </span>
        {kind === 'note' && (
          <div className="note-controls">
            <button
              data-testid="note-pin"
              aria-label="窗口置顶"
              aria-pressed={desktop?.pinned ?? true}
              disabled={Boolean(desktop?.edge)}
              onClick={() =>
                void windowAction(async () => unwrap(await getDesktopApi().toggleNotePin()))
              }
            >
              <svg
                viewBox="0 0 20 20"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M7 2h6l-1 5 3 4H5l3-4-1-5ZM10 11v7" />
              </svg>
            </button>
            <button
              data-testid="note-close"
              aria-label="隐藏桌面便签"
              onClick={() =>
                void windowAction(async () => unwrap(await getDesktopApi().hideWindow()))
              }
            >
              <svg
                viewBox="0 0 20 20"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="m5 5 10 10M15 5 5 15" />
              </svg>
            </button>
          </div>
        )}
      </header>
      {kind === 'main' && <p className="task-intro">把今天要做的事，简单记下来。</p>}
      <div className="task-list" aria-label="任务">
        {today?.tasks.length === 0 && (
          <div className="task-empty">
            <span aria-hidden="true">☀</span>
            <p>今天，留一点空间。</p>
            <small>在下方记下第一项任务</small>
          </div>
        )}
        {today?.tasks.map((task, index) => (
          <div
            className={`task-row ${task.completed ? 'completed' : ''} ${task.kind === 'multi-day' && today.tasks[index - 1]?.kind !== 'multi-day' ? 'multi-day-start' : ''}`}
            key={task.id}
            data-task-id={task.id}
            data-task-kind={task.kind}
          >
            <input
              type="checkbox"
              checked={task.completed}
              disabled={busy}
              aria-label={`完成：${task.description}`}
              onChange={() => void complete(task)}
            />
            <div className="task-content">
              {editing === task.id ? (
                <form className="task-edit-form" onSubmit={(event) => void save(event)}>
                  <span className="task-description task-edit-mirror" aria-hidden="true">
                    {edited.value || '\u200b'}
                  </span>
                  <textarea
                    className="task-description task-edit-input"
                    data-testid="task-edit"
                    aria-label="编辑任务描述"
                    rows={1}
                    value={edited.value}
                    ref={focusTaskEditor}
                    onChange={(event) => edited.setValue(event.target.value)}
                    onBlur={() => {
                      void edited.save()
                    }}
                    onCompositionStart={() => {
                      edited.composing.current = true
                    }}
                    onCompositionEnd={edited.endComposition}
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing || event.keyCode === 229) return
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void save(event)
                      }
                    }}
                  />
                </form>
              ) : (
                <button
                  className="task-description"
                  data-testid="task-description"
                  disabled={busy}
                  onClick={async () => {
                    if (editing && !(await edited.save())) return
                    setEditing(task.id)
                    edited.start(task)
                    setError('')
                  }}
                >
                  {task.description}
                </button>
              )}
              {task.kind === 'multi-day' && (
                <label className="task-progress">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    data-testid="task-progress"
                    aria-label={`进度：${task.description}`}
                    value={task.progress}
                    disabled={busy || Boolean(task.subitems?.length)}
                    aria-readonly={Boolean(task.subitems?.length)}
                    onChange={(event) => void progress(task.id, Number(event.target.value))}
                    onFocus={() => setProgressFocused(true)}
                    onBlur={() => setProgressFocused(false)}
                  />
                  <span>{task.progress}%</span>
                </label>
              )}
              <SubitemsPanel
                task={task}
                changed={refresh}
                report={setError}
                onSaveReady={onSubitemSaveReady}
                onInteraction={onSubitemInteraction}
              />
            </div>
            {task.kind === 'today' && (
              <button
                className="task-convert"
                data-testid="task-convert"
                disabled={busy}
                aria-label={`转为多天任务：${task.description}`}
                onClick={async () => {
                  if (await flush.current()) await convert(task.id)
                }}
              >
                ↗
              </button>
            )}
            {task.kind === 'today' && !task.habitId && (
              <button
                className="task-convert"
                data-testid="task-to-habit"
                disabled={busy}
                aria-label={`添加为习惯：${task.description}`}
                onClick={async () => {
                  if (await flush.current()) await addHabit(task.id)
                }}
              >
                ↻
              </button>
            )}
            {task.habitId && (
              <span className="habit-source" data-testid="habit-source">
                ↻ 来自习惯
              </span>
            )}
            <button
              className="task-delete"
              data-testid="task-delete"
              disabled={busy}
              aria-label={`删除：${task.description}`}
              onClick={async () => {
                if (await flush.current()) await remove(task.id)
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <InspirationPanel
        ref={inspirationPanel}
        report={setError}
        onEditingChange={setInspirationEditing}
      />
      {error && (
        <p className="task-error" role="alert">
          {error}
        </p>
      )}
      <form className="task-add" onSubmit={(event) => void add(event)}>
        <div className="new-kind-switch" aria-label="新增类别">
          {(['task', 'inspiration'] as const).map((value) => (
            <button
              key={value}
              type="button"
              data-testid={`new-kind-${value}`}
              aria-pressed={newKind === value}
              onClick={async () => {
                if (newKind !== value && (await added.save())) {
                  setNewKind(value)
                  setError('')
                }
              }}
            >
              {value === 'task' ? '任务' : '灵感'}
            </button>
          ))}
        </div>
        <span aria-hidden="true">＋</span>
        <input
          data-testid="task-new"
          aria-label={newKind === 'task' ? '新增任务描述' : '新增灵感'}
          placeholder={newKind === 'task' ? '记下一项任务，自动保存' : '记下一个想法，自动保存'}
          data-new-kind={newKind}
          value={added.value}
          disabled={!today}
          onChange={(event) => added.setValue(event.target.value)}
          onFocus={() => setInputFocused(true)}
          onBlur={() => {
            setInputFocused(false)
            void added.save()
          }}
          onCompositionStart={() => {
            added.composing.current = true
          }}
          onCompositionEnd={added.endComposition}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (!event.nativeEvent.isComposing && event.keyCode !== 229) void add(event)
            }
          }}
        />
      </form>
      {kind === 'main' && <HabitsPanel onSaveReady={onHabitSaveReady} />}
      <footer className="task-footer">
        {added.saving || edited.saving ? '正在保存…' : '自动保存 · 回车记下一项'}
      </footer>
    </section>
  )
}

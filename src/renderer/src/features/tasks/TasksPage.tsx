import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { DesktopState, WindowKind } from '../../../../shared/contracts'
import { getDesktopApi, unwrap } from '../../platform/desktop'
import { useTasks } from './useTasks'
import { useTaskInput } from './useTaskInput'

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
  const { today, error, busy, setError, refresh, complete, remove } = useTasks()
  const added = useTaskInput(today?.date, refresh, setError)
  const edited = useTaskInput(today?.date, refresh, setError)
  const [editing, setEditing] = useState<string | null>(null)
  const [inputFocused, setInputFocused] = useState(false)
  const flush = useRef(async () => true)
  flush.current = async () => {
    const results = await Promise.all([added.save(), edited.save()])
    return results.every(Boolean)
  }
  useEffect(() => {
    const api = getDesktopApi()
    const unsubscribe = api.onSaveRequested(() => flush.current())
    const onBlur = () => {
      void flush.current()
    }
    window.addEventListener('blur', onBlur)
    return () => {
      unsubscribe()
      window.removeEventListener('blur', onBlur)
    }
  }, [])
  useEffect(() => {
    if (kind === 'note') void getDesktopApi().setInteraction(inputFocused || editing !== null)
  }, [kind, inputFocused, editing])
  useEffect(() => {
    if (today) added.reconcile(today.tasks)
    if (editing && today && !today.tasks.some((task) => task.id === editing)) {
      setEditing(null)
      setInputFocused(false)
      void edited.cancel()
    }
  }, [today, editing])
  const add = async (event: FormEvent) => {
    event.preventDefault()
    await added.submit()
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (editing && (await edited.submit())) {
      setEditing(null)
      setInputFocused(false)
    }
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
    <section className={`tasks-page ${kind}`} hidden={hidden}>
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
      <header className="task-heading">
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
              title={desktop?.edge ? '贴边时始终置顶' : '切换本次置顶'}
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
              title="隐藏桌面便签"
              onClick={() =>
                void windowAction(async () => unwrap(await getDesktopApi().hideWindow()))
              }
            >
              ×
            </button>
          </div>
        )}
      </header>
      {kind === 'main' && <p className="task-intro">把今天要做的事，简单记下来。</p>}
      <div className="task-list" aria-label="今天任务">
        {today?.tasks.length === 0 && (
          <div className="task-empty">
            <span aria-hidden="true">☀</span>
            <p>今天，留一点空间。</p>
            <small>在下方记下第一项任务</small>
          </div>
        )}
        {today?.tasks.map((task) => (
          <div
            className={`task-row ${task.completed ? 'completed' : ''}`}
            key={task.id}
            data-task-id={task.id}
          >
            <input
              type="checkbox"
              checked={task.completed}
              disabled={busy}
              aria-label={`完成：${task.description}`}
              onChange={() => void complete(task)}
            />
            {editing === task.id ? (
              <form className="task-edit-form" onSubmit={(event) => void save(event)}>
                <input
                  data-testid="task-edit"
                  aria-label="编辑任务描述"
                  value={edited.value}
                  autoFocus
                  onChange={(event) => edited.setValue(event.target.value)}
                  onMouseLeave={() => void edited.save()}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => {
                    setInputFocused(false)
                    void edited.save()
                  }}
                  onCompositionStart={() => {
                    edited.composing.current = true
                  }}
                  onCompositionEnd={edited.endComposition}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing || event.keyCode === 229) return
                    if (event.key === 'Escape') {
                      void edited.cancel().then(() => {
                        setEditing(null)
                        setInputFocused(false)
                      })
                    }
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
            <button
              className="task-delete"
              data-testid="task-delete"
              disabled={busy}
              aria-label={`删除：${task.description}`}
              title="删除任务"
              onClick={() => void remove(task.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {error && (
        <p className="task-error" role="alert">
          {error}
        </p>
      )}
      <form className="task-add" onSubmit={(event) => void add(event)}>
        <span aria-hidden="true">＋</span>
        <input
          data-testid="task-new"
          aria-label="新增任务描述"
          placeholder="记下一项任务，自动保存"
          value={added.value}
          disabled={!today}
          onChange={(event) => added.setValue(event.target.value)}
          onMouseLeave={() => void added.save()}
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
            if (event.key === 'Escape' && !event.nativeEvent.isComposing) void added.cancel()
            if (event.key === 'Enter') {
              event.preventDefault()
              if (!event.nativeEvent.isComposing && event.keyCode !== 229) void add(event)
            }
          }}
        />
      </form>
      <footer className="task-footer">
        {added.saving
          ? '正在保存…'
          : added.saved
            ? '已保存 · 继续修改，回车记下一项'
            : '自动保存 · 回车记下一项 · Esc结束编辑'}
      </footer>
    </section>
  )
}

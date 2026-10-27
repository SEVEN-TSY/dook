import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { WindowKind } from '../../../../shared/contracts'
import { getDesktopApi, unwrap } from '../../platform/desktop'
import { useTasks } from './useTasks'

export function TasksPage({ kind }: { kind: WindowKind }) {
  const { today, error, busy, setError, create, update, complete, remove } = useTasks()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  useEffect(() => {
    if (editing && today && !today.tasks.some((task) => task.id === editing)) setEditing(null)
  }, [today, editing])
  const add = async (event: FormEvent) => {
    event.preventDefault()
    if (await create(draft)) setDraft('')
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (editing && (await update(editing, description))) setEditing(null)
  }
  const openOther = async () => {
    try {
      unwrap(await getDesktopApi().openWindow(kind === 'main' ? 'note' : 'main'))
    } catch (error) {
      setError(error instanceof Error ? error.message : '打开窗口失败。')
    }
  }
  const completed = today?.tasks.filter((task) => task.completed).length ?? 0
  return (
    <section className={`tasks-page ${kind}`}>
      <div className="task-toolbar">
        <span className="task-brand">
          ✓ <strong>myTodo</strong>
        </span>
        <button data-testid="open-other" onClick={() => void openOther()}>
          {kind === 'main' ? '打开桌面便签' : '打开主界面'} <span aria-hidden="true">↗</span>
        </button>
      </div>
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
                  value={description}
                  autoFocus
                  disabled={busy}
                  onChange={(event) => setDescription(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing || event.keyCode === 229) return
                    if (event.key === 'Escape') {
                      setEditing(null)
                      setError('')
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
                onClick={() => {
                  setEditing(task.id)
                  setDescription(task.description)
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
          placeholder="记下一项任务，回车添加"
          value={draft}
          disabled={!today || busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (!event.nativeEvent.isComposing && event.keyCode !== 229) void add(event)
            }
          }}
        />
      </form>
      <footer className="task-footer">
        {kind === 'main' ? '点击描述编辑 · 回车保存 · Esc取消' : '一件一件，慢慢完成。'}
      </footer>
    </section>
  )
}

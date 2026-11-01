import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { DesktopState, MainPage, WindowKind, Task } from '../../../../shared/contracts'
import { getDesktopApi, unwrap } from '../../platform/desktop'
import { SubitemsPanel } from './SubitemsPanel'
import { useTasks } from './useTasks'
import { useTaskInput } from './useTaskInput'
import { HabitsPanel } from '../habits/HabitsPanel'
import { InspirationPanel } from '../inspirations/InspirationPanel'
import type { InspirationPanelHandle } from '../inspirations/InspirationPanel'
import { useInspirationInput } from '../inspirations/useInspirationInput'
import { SettingsPage } from '../settings/SettingsPage'

const INSPIRATION_GOAL = 5

function NavIcon({
  name,
  lit = false
}: {
  name: 'task' | 'habit' | 'inspiration' | 'settings' | 'note' | 'add'
  lit?: boolean
}) {
  const paths = {
    add: <path d="M10 4v12M4 10h12" />,
    task: (
      <>
        <rect x="3.5" y="4" width="13" height="13" rx="3" />
        <path d="m7 10 2 2 4-4" />
      </>
    ),
    habit: (
      <>
        <path d="M15.5 7A6 6 0 0 0 5 6L3.5 8M4.5 13A6 6 0 0 0 15 14l1.5-2" />
        <path d="M3.5 4.5V8H7M16.5 15.5V12H13" />
      </>
    ),
    inspiration: (
      <>
        <path
          d="M7 14c0-1.6-2.5-2.7-2.5-5a5.5 5.5 0 0 1 11 0c0 2.3-2.5 3.4-2.5 5Z"
          fill={lit ? '#f4ca55' : 'none'}
        />
        <path d="M8 17h4" />
        {lit && <path d="M10 0.5v1M1 8h1m16 0h1M2.5 2.5l1 1m13-1-1 1" />}
      </>
    ),
    settings: (
      <>
        <circle cx="10" cy="10" r="3" />
        <path d="M10 2.5v1.2M10 16.3v1.2M2.5 10h1.2M16.3 10h1.2M4.7 4.7l.9.9m8.8 8.8.9.9m0-10.6-.9.9m-8.8 8.8-.9.9" />
      </>
    ),
    note: (
      <>
        <rect x="4" y="3.5" width="12" height="13" rx="2" />
        <path d="M7 7h6M7 10h6M7 13h3" />
      </>
    )
  }
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

function TaskActionIcon({
  name
}: {
  name: 'convert' | 'habit' | 'schedule' | 'pin' | 'unpin' | 'delete'
}) {
  const paths = {
    convert: 'M5 5 15 15M5 15h10V5',
    habit: 'M15.2 7A6 6 0 1 0 16 12M15.2 3.5V7h-3.5',
    schedule: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM10 6v4l3 2',
    pin: 'M4 4h12M10 16V7m-4 4 4-4 4 4',
    unpin: 'M4 16h12M10 4v9m-4-4 4 4 4-4',
    delete: 'M5 5l10 10M15 5 5 15'
  }
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}

function focusTaskEditor(element: HTMLTextAreaElement | null) {
  if (!element) return
  element.focus({ preventScroll: true })
  element.setSelectionRange(element.value.length, element.value.length)
}

function useSummaryMotion(count: number | undefined, shrinkOnDecrease = false) {
  const element = useRef<HTMLButtonElement>(null)
  const previousCount = useRef(count)
  const animation = useRef<Animation | null>(null)
  useEffect(() => () => animation.current?.cancel(), [])
  useEffect(() => {
    const previous = previousCount.current
    previousCount.current = count
    if (
      count === undefined ||
      previous === undefined ||
      count === previous ||
      (count < previous && !shrinkOnDecrease)
    )
      return
    const target = element.current
    if (!target) return
    const growing = count > previous
    const transform = getComputedStyle(target).transform
    animation.current?.cancel()
    animation.current = target.animate(
      [
        { transform: transform === 'none' ? 'scale(1)' : transform },
        { transform: `scale(${growing ? 1.18 : 0.82})`, offset: 0.38 },
        { transform: `scale(${growing ? 0.98 : 1.02})`, offset: 0.72 },
        { transform: 'scale(1)' }
      ],
      { duration: 420, easing: 'ease-out' }
    )
  }, [count, shrinkOnDecrease])
  return element
}

export function TasksPage({
  kind,
  desktop,
  hidden,
  tasks
}: {
  kind: WindowKind
  desktop: DesktopState | null
  hidden: boolean
  tasks: ReturnType<typeof useTasks>
}) {
  const {
    today,
    error,
    busy,
    setError,
    refresh,
    complete,
    remove,
    skipHabit,
    convert,
    progress,
    addHabit,
    pin,
    move
  } = tasks
  const [page, setPage] = useState<MainPage>('task')
  const [adding, setAdding] = useState(false)
  const [expandedNoteGroups, setExpandedNoteGroups] = useState({ today: true, 'multi-day': false })
  const [draggingTask, setDraggingTask] = useState<Task | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; before: boolean } | null>(null)
  const noteInput = useRef<HTMLInputElement>(null)
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const [newKind, setNewKind] = useState<'task' | 'inspiration'>('task')
  const taskAdded = useTaskInput(today?.date, refresh, setError)
  const [loadedInspirationCount, setInspirationCount] = useState<number>()
  const inspirationCount = loadedInspirationCount ?? 0
  const taskSummary = useSummaryMotion(kind === 'note' ? today?.tasks.length : undefined, true)
  const inspirationSummary = useSummaryMotion(kind === 'note' ? loadedInspirationCount : undefined)
  const inspirationCountVersion = useRef(0)
  const refreshInspirationCount = useCallback(async () => {
    if (kind !== 'note') return
    const version = ++inspirationCountVersion.current
    try {
      const ideas = unwrap(await getDesktopApi().listInspirations())
      if (version === inspirationCountVersion.current) setInspirationCount(ideas.length)
    } catch (error) {
      if (version === inspirationCountVersion.current)
        setError(error instanceof Error ? error.message : '读取灵感数量失败。')
    }
  }, [kind, setError])
  useEffect(() => {
    if (kind !== 'note') return
    void refreshInspirationCount()
    const unsubscribe = getDesktopApi().onTasksChanged(() => void refreshInspirationCount())
    window.addEventListener('focus', refreshInspirationCount)
    return () => {
      inspirationCountVersion.current++
      unsubscribe()
      window.removeEventListener('focus', refreshInspirationCount)
    }
  }, [kind, refreshInspirationCount])
  const inspirationAdded = useInspirationInput(
    async (text, id) =>
      unwrap(
        await (id
          ? getDesktopApi().updateInspiration(id, text)
          : getDesktopApi().createInspiration(text))
      ),
    refreshInspirationCount,
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
  useEffect(() => {
    if (kind !== 'main' || !desktop?.mainNavigation) return
    let active = true
    const target = desktop.mainNavigation.page
    void flush.current().then((saved) => {
      if (!active || !saved) return
      setPage(target)
      setNewKind(target === 'inspiration' ? 'inspiration' : 'task')
      setAdding(false)
      setSelectedTask(null)
      setError('')
    })
    return () => {
      active = false
    }
  }, [kind, desktop?.mainNavigation?.revision])
  const clickOutside = useRef((_target: EventTarget | null) => {})
  clickOutside.current = (target) => {
    const element = target instanceof Element ? target : null
    if (!element?.closest('[data-testid="task-new"], .workbench-add, .note-add-controls'))
      void added.save()
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
        inputFocused ||
          editing !== null ||
          inspirationEditing ||
          subitemEditing ||
          progressFocused ||
          draggingTask !== null ||
          busy
      )
  }, [
    kind,
    inputFocused,
    editing,
    inspirationEditing,
    subitemEditing,
    progressFocused,
    draggingTask,
    busy
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
    noteInput.current?.focus({ preventScroll: true })
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
  const openMainPage = async (target: MainPage) => {
    if (!(await flush.current())) return
    try {
      unwrap(await getDesktopApi().openWindow('main', target))
    } catch (error) {
      setError(error instanceof Error ? error.message : '打开页面失败。')
    }
  }
  const completed = today?.tasks.filter((task) => task.completed).length ?? 0
  const noteGroups = {
    today: today?.tasks.filter((task) => task.kind === 'today') ?? [],
    'multi-day': today?.tasks.filter((task) => task.kind === 'multi-day') ?? []
  }
  const windowAction = async (action: () => Promise<unknown>) => {
    try {
      await action()
    } catch (error) {
      setError(error instanceof Error ? error.message : '窗口操作失败。')
    }
  }
  if (kind === 'main') {
    const selected = today?.tasks.find((task) => task.id === selectedTask)
    const navigate = async (next: typeof page) => {
      if (!(await flush.current())) return
      setPage(next)
      setNewKind(next === 'inspiration' ? 'inspiration' : 'task')
      setAdding(false)
      setSelectedTask(null)
      setError('')
    }
    return (
      <section className="workbench" hidden={hidden}>
        <aside className="workbench-sidebar">
          <div className="workbench-brand">
            <span className="brand-mark">✓</span>
            <strong>myTodo</strong>
          </div>
          <nav className="workbench-nav" aria-label="主导航">
            <strong className="space-label">我的空间</strong>
            {(
              [
                ['task', '任务'],
                ['habit', '习惯'],
                ['inspiration', '灵感']
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                aria-label={label}
                aria-current={page === id ? 'page' : undefined}
                onClick={() => void navigate(id)}
              >
                <NavIcon name={id} />
                <span>{label}</span>
              </button>
            ))}
            <button
              className="nav-settings"
              data-testid="open-settings"
              aria-label="设置"
              aria-current={page === 'settings' ? 'page' : undefined}
              onClick={() => void navigate('settings')}
            >
              <NavIcon name="settings" />
              <span>设置</span>
            </button>
            <button
              data-testid="open-other"
              aria-label="打开桌面便签"
              onClick={() => void openOther()}
            >
              <NavIcon name="note" />
              <span>桌面便签</span>
              <span className="nav-arrow">↗</span>
            </button>
          </nav>
        </aside>
        <main className="workbench-main">
          <header className="workbench-header">
            <div>
              {page === 'task' && <p className="workbench-date">{today?.date}</p>}
              <h1>
                {{ task: '今天', habit: '习惯', inspiration: '灵感', settings: '设置' }[page]}
              </h1>
            </div>
            {page !== 'settings' && (
              <button
                className="primary-button"
                onClick={() => {
                  setAdding(true)
                  setNewKind(page === 'inspiration' ? 'inspiration' : 'task')
                }}
              >
                ＋ 新增{{ task: '任务', habit: '习惯', inspiration: '灵感' }[page]}
              </button>
            )}
          </header>
          {page !== 'settings' && page !== 'habit' && adding && (
            <form
              className="workbench-add"
              onSubmit={async (event) => {
                event.preventDefault()
                if (await added.submit()) setAdding(false)
              }}
            >
              <input
                autoFocus
                data-testid="task-new"
                aria-label={newKind === 'task' ? '新增任务描述' : '新增灵感'}
                placeholder={newKind === 'task' ? '添加一个今天要做的事…' : '记下一个想法'}
                value={added.value}
                onChange={(event) => added.setValue(event.target.value)}
                onCompositionStart={() => {
                  added.composing.current = true
                }}
                onCompositionEnd={added.endComposition}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    (event.nativeEvent.isComposing || event.keyCode === 229)
                  )
                    event.preventDefault()
                }}
              />
              <button type="submit">保存</button>
              <button
                type="button"
                onClick={async () => {
                  if (newKind === 'task') await taskAdded.cancel()
                  else inspirationAdded.start()
                  setAdding(false)
                  setError('')
                }}
              >
                取消
              </button>
            </form>
          )}
          {error && (
            <p className="task-error" role="alert">
              {error}
            </p>
          )}
          <div
            className={`workbench-split ${selected ? 'has-detail' : ''}`}
            hidden={page !== 'task'}
          >
            <div className="workbench-list" aria-label="任务">
              <button
                className="quick-add"
                onClick={async () => {
                  if (newKind !== 'task' && !(await added.save())) return
                  setNewKind('task')
                  setAdding(true)
                }}
              >
                <span>＋</span> 添加一个今天要做的事…
              </button>
              {today?.tasks.length === 0 && (
                <div className="workbench-empty">
                  <span className="empty-icon" aria-hidden="true">
                    ✓
                  </span>
                  <strong>给今天留个开始</strong>
                  <span>点击右上角，记下第一项任务</span>
                </div>
              )}
              {today?.tasks.map((task, index) => (
                <div
                  key={task.id}
                  data-task-id={task.id}
                  data-task-kind={task.kind}
                  className={`task-row ${task.completed ? 'completed' : ''} ${task.kind === 'multi-day' && today.tasks[index - 1]?.kind !== 'multi-day' ? 'multi-day-start' : ''} ${selectedTask === task.id ? 'selected' : ''}`}
                >
                  {task.kind === 'multi-day' && today.tasks[index - 1]?.kind !== 'multi-day' && (
                    <span className="group-label">持续推进</span>
                  )}
                  <input
                    type="checkbox"
                    checked={task.completed}
                    disabled={busy}
                    aria-label={`完成：${task.description}`}
                    onChange={() => void complete(task)}
                  />
                  <div className="task-content">
                    <button
                      className="task-description"
                      data-testid="task-description"
                      title={task.habitId ? '点击在主界面打开' : undefined}
                      onClick={async () => {
                        if (task.habitId) {
                          await navigate('habit')
                          return
                        }
                        if (!(await flush.current())) return
                        setSelectedTask(task.id)
                        setEditing(task.id)
                        edited.start(task)
                      }}
                    >
                      {task.description}
                    </button>
                    {task.kind === 'multi-day' && (
                      <p className="task-meta">
                        进度 {task.progress}%
                        {task.subitems?.length
                          ? ` · 子事项 ${task.subitems.filter((item) => item.completed).length}／${task.subitems.length}`
                          : ''}
                      </p>
                    )}
                  </div>
                  <details
                    className="task-more"
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.currentTarget.open = false
                        event.currentTarget.querySelector('summary')?.focus()
                      }
                    }}
                    onClick={(event) => {
                      if ((event.target as Element).closest('.task-menu button'))
                        event.currentTarget.open = false
                    }}
                  >
                    <summary aria-label={`更多操作：${task.description}`} title="更多操作">
                      •••
                    </summary>
                    <div className="task-menu">
                      {task.kind === 'today' && !task.habitId && (
                        <button
                          data-testid="task-convert"
                          onClick={async () => {
                            if (await flush.current()) await convert(task.id)
                          }}
                        >
                          转为多天任务
                        </button>
                      )}
                      {task.kind === 'today' && !task.habitId && (
                        <button
                          data-testid="task-to-habit"
                          onClick={async () => {
                            if (await flush.current()) await addHabit(task.id)
                          }}
                        >
                          添加为习惯
                        </button>
                      )}
                      <button
                        data-testid="task-delete"
                        onClick={async () => {
                          if (await flush.current()) {
                            if (task.habitId) await skipHabit(task.id)
                            else await remove(task.id)
                          }
                        }}
                      >
                        {task.habitId ? '暂停一次' : '删除任务'}
                      </button>
                    </div>
                  </details>
                </div>
              ))}
            </div>
            {selected && (
              <aside className="workbench-detail" aria-label="任务详情">
                <button
                  className="detail-back"
                  onClick={async () => {
                    if (await flush.current()) setSelectedTask(null)
                  }}
                >
                  ← 返回列表
                </button>
                <h2>任务详情</h2>
                <label className="detail-label">任务描述</label>
                {editing === selected.id ? (
                  <textarea
                    data-testid="task-edit"
                    aria-label="编辑任务描述"
                    value={edited.value}
                    onChange={(event) => edited.setValue(event.target.value)}
                    onBlur={() => void edited.save()}
                    onCompositionStart={() => {
                      edited.composing.current = true
                    }}
                    onCompositionEnd={edited.endComposition}
                  />
                ) : (
                  <button
                    className="detail-description"
                    onClick={() => {
                      setEditing(selected.id)
                      edited.start(selected)
                    }}
                  >
                    {selected.description}
                  </button>
                )}
                {selected.kind === 'multi-day' && (
                  <label className="detail-progress">
                    进度 {selected.progress}%
                    <input
                      type="range"
                      min="0"
                      max="100"
                      data-testid="task-progress"
                      aria-label={`进度：${selected.description}`}
                      value={selected.progress}
                      disabled={busy || Boolean(selected.subitems?.length)}
                      onChange={(event) => void progress(selected.id, Number(event.target.value))}
                    />
                  </label>
                )}
                <SubitemsPanel
                  task={selected}
                  changed={refresh}
                  report={setError}
                  onSaveReady={onSubitemSaveReady}
                  onInteraction={onSubitemInteraction}
                />
              </aside>
            )}
          </div>
          <div hidden={page !== 'habit'}>
            <HabitsPanel
              onSaveReady={onHabitSaveReady}
              showAdd={adding}
              onAddDone={() => setAdding(false)}
            />
          </div>
          <div hidden={page !== 'inspiration'}>
            <InspirationPanel
              ref={inspirationPanel}
              report={setError}
              onEditingChange={setInspirationEditing}
              workbench
            />
          </div>
          <SettingsPage
            state={desktop}
            close={() => void navigate('task')}
            hidden={page !== 'settings'}
          />
        </main>
      </section>
    )
  }
  return (
    <section
      className={`tasks-page ${kind} ${desktop?.edge ? `docked-${desktop.edge}` : ''} ${desktop?.noteMotion ? `note-motion-${desktop.noteMotion}` : ''}`}
      hidden={hidden}
    >
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
        {kind === 'note' && (
          <div className="note-controls">
            <button
              data-testid="note-settings"
              title="打开设置"
              aria-label="打开设置"
              onClick={() => void openMainPage('settings')}
            >
              <svg
                viewBox="0 0 20 20"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m8 2-.5 2-1.5.9-2-.6-2 3.4L3.5 9v2L2 12.3l2 3.4 2-.6 1.5.9.5 2h4l.5-2 1.5-.9 2 .6 2-3.4-1.5-1.3V9L18 7.7l-2-3.4-2 .6-1.5-.9-.5-2Z" />
                <circle cx="10" cy="10" r="3" />
              </svg>
            </button>
            <button
              data-testid="note-pin"
              title="窗口置顶"
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
              title="隐藏桌面便签"
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

      <div className="task-list" aria-label="任务">
        {today?.tasks.length === 0 && (
          <div className="task-empty">
            <span aria-hidden="true">☀</span>
            <p>今天，留一点空间。</p>
            <small>在下方记下第一项任务</small>
          </div>
        )}
        {today?.tasks.map((task, index) => (
          <Fragment key={task.id}>
            {today.tasks[index - 1]?.kind !== task.kind && (
              <button
                type="button"
                className="note-group-heading"
                title={task.kind === 'today' ? '今天需要完成' : '要花几天完成'}
                aria-expanded={expandedNoteGroups[task.kind]}
                onClick={async () => {
                  if (expandedNoteGroups[task.kind] && !(await flush.current())) return
                  setExpandedNoteGroups((groups) => ({
                    ...groups,
                    [task.kind]: !groups[task.kind]
                  }))
                }}
              >
                <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
                  <path
                    d={expandedNoteGroups[task.kind] ? 'm3 4.5 3 3 3-3' : 'm4.5 3 3 3-3 3'}
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {task.kind === 'today' ? '这就去做' : '持续推进'}
                <span className="note-group-count">
                  {noteGroups[task.kind].filter((item) => item.completed).length}/
                  {noteGroups[task.kind].length}
                </span>
              </button>
            )}
            <div
              className={`task-row ${task.completed ? 'completed' : ''} ${draggingTask?.id === task.id ? 'is-dragging' : ''} ${dropTarget?.id === task.id ? (dropTarget.before ? 'drop-before' : 'drop-after') : ''}`}
              data-task-id={task.id}
              data-task-kind={task.kind}
              data-task-pinned={Boolean(task.pinned)}
              hidden={!expandedNoteGroups[task.kind]}
              draggable={!busy && editing === null}
              onDragStart={(event) => {
                if (
                  (event.target as Element).closest(
                    'input, textarea, .note-task-actions, .task-pin'
                  )
                ) {
                  event.preventDefault()
                  return
                }
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', task.id)
                setDraggingTask(task)
              }}
              onDragOver={(event) => {
                if (
                  !draggingTask ||
                  draggingTask.id === task.id ||
                  draggingTask.kind !== task.kind ||
                  Boolean(draggingTask.pinned) !== Boolean(task.pinned)
                ) {
                  setDropTarget(null)
                  return
                }
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                const bounds = event.currentTarget.getBoundingClientRect()
                const before = event.clientY < bounds.top + bounds.height / 2
                if (dropTarget?.id !== task.id || dropTarget.before !== before)
                  setDropTarget({ id: task.id, before })
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                  setDropTarget(null)
              }}
              onDrop={(event) => {
                event.preventDefault()
                const source = draggingTask
                const target = dropTarget
                setDraggingTask(null)
                setDropTarget(null)
                if (source && target?.id === task.id) {
                  void (async () => {
                    if (await flush.current()) await move(source.id, task.id, target.before)
                  })()
                }
              }}
              onDragEnd={() => {
                setDraggingTask(null)
                setDropTarget(null)
              }}
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
                    title={task.habitId ? '点击在主界面打开' : task.description}
                    disabled={busy}
                    onClick={async () => {
                      if (task.habitId) {
                        await openMainPage('habit')
                        return
                      }
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
              </div>
              <div className="note-task-actions">
                <div className="note-task-secondary">
                  {task.kind === 'today' && !task.habitId && (
                    <button
                      className="task-convert"
                      data-testid="task-convert"
                      title="转为多天任务"
                      disabled={busy}
                      aria-label={`转为多天任务：${task.description}`}
                      onClick={async () => {
                        if (await flush.current()) await convert(task.id)
                      }}
                    >
                      <TaskActionIcon name="convert" />
                    </button>
                  )}
                  {task.kind === 'today' && !task.habitId && (
                    <button
                      className="task-convert"
                      data-testid="task-to-habit"
                      title="添加为习惯"
                      disabled={busy}
                      aria-label={`添加为习惯：${task.description}`}
                      onClick={async () => {
                        if (await flush.current()) await addHabit(task.id)
                      }}
                    >
                      <TaskActionIcon name="habit" />
                    </button>
                  )}
                  <button
                    className="task-pin"
                    data-testid="task-pin"
                    title={task.pinned ? '取消置顶' : '置顶任务'}
                    aria-label={`${task.pinned ? '取消置顶' : '置顶任务'}：${task.description}`}
                    aria-pressed={Boolean(task.pinned)}
                    disabled={busy}
                    onClick={async () => {
                      if (await flush.current()) await pin(task)
                    }}
                  >
                    <TaskActionIcon name={task.pinned ? 'unpin' : 'pin'} />
                  </button>
                </div>
                <button
                  className="task-delete"
                  data-testid="task-delete"
                  title={task.habitId ? '暂停一次' : '删除任务'}
                  disabled={busy}
                  aria-label={`${task.habitId ? '暂停一次' : '删除'}：${task.description}`}
                  onClick={async () => {
                    if (await flush.current()) {
                      if (task.habitId) await skipHabit(task.id)
                      else await remove(task.id)
                    }
                  }}
                >
                  {task.habitId ? (
                    <>
                      <span className="habit-task-clock">
                        <TaskActionIcon name="schedule" />
                      </span>
                      <span className="habit-task-delete">
                        <TaskActionIcon name="delete" />
                      </span>
                    </>
                  ) : (
                    <TaskActionIcon name="delete" />
                  )}
                </button>
              </div>
            </div>
          </Fragment>
        ))}
      </div>
      {error && (
        <p className="task-error" role="alert">
          {error}
        </p>
      )}
      <div className={`note-bottom ${adding ? 'is-editing' : ''}`}>
        <form
          className={`task-add ${adding ? 'is-editing' : ''}`}
          onSubmit={(event) => void add(event)}
          onFocus={() => setInputFocused(true)}
          onBlur={(event) => {
            const form = event.currentTarget
            if (form.contains(event.relatedTarget)) return
            setInputFocused(false)
            void added.save().then((saved) => {
              if (saved && !form.contains(document.activeElement)) setAdding(false)
            })
          }}
        >
          <div className={`note-add-controls ${newKind === 'inspiration' ? 'is-inspiration' : ''}`}>
            <div className="new-kind-switch" aria-label="新增类别">
              {(['task', 'inspiration'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  data-testid={`new-kind-${value}`}
                  title={value === 'task' ? '添加任务' : '添加灵感'}
                  aria-label={value === 'task' ? '添加任务' : '添加灵感'}
                  aria-pressed={newKind === value}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={async () => {
                    const switching = newKind !== value
                    if (switching) {
                      if (!(await added.save())) return
                      setNewKind(value)
                      setError('')
                    }
                    if (switching || value === 'inspiration') {
                      setAdding(true)
                      requestAnimationFrame(() => noteInput.current?.focus())
                    }
                  }}
                >
                  <NavIcon
                    name={value}
                    lit={value === 'inspiration' && newKind === 'inspiration'}
                  />
                </button>
              ))}
            </div>
            <input
              data-testid="task-new"
              aria-label={newKind === 'task' ? '新增任务描述' : '新增灵感'}
              placeholder={newKind === 'task' ? '写下任务…' : '写下灵感…'}
              data-new-kind={newKind}
              ref={noteInput}
              aria-hidden={!adding}
              tabIndex={adding ? 0 : -1}
              inert={!adding}
              value={added.value}
              disabled={!today}
              onChange={(event) => added.setValue(event.target.value)}
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
            <button
              className="note-add-button"
              type="button"
              title={newKind === 'task' ? '添加任务' : '添加灵感'}
              aria-label={newKind === 'task' ? '添加任务' : '添加灵感'}
              aria-expanded={adding}
              onPointerDown={(event) => event.preventDefault()}
              onClick={(event) => {
                if (adding) {
                  void add(event)
                  return
                }
                setAdding(true)
                requestAnimationFrame(() => noteInput.current?.focus())
              }}
            >
              <NavIcon name="add" />
            </button>
          </div>
        </form>

        <button
          type="button"
          className="note-summary note-task-summary"
          ref={taskSummary}
          title="在主界面打开任务"
          aria-label={`在主界面打开任务，已完成${completed}项，共${today?.tasks.length ?? 0}项`}
          onClick={() => void openMainPage('task')}
        >
          <svg className="note-progress-ring" viewBox="0 0 36 36" aria-hidden="true">
            <circle className="note-progress-track" cx="18" cy="18" r="16.5" />
            <circle
              className="note-progress-value"
              cx="18"
              cy="18"
              r="16.5"
              pathLength="100"
              strokeDasharray={`${today?.tasks.length ? (completed / today.tasks.length) * 100 : 0} 100`}
            />
          </svg>
          <span className="note-progress-count">
            <strong>{completed}</strong>
            <span>/</span>
            <span>{today?.tasks.length ?? 0}</span>
          </span>
        </button>
        <button
          type="button"
          className="note-summary note-inspiration-summary"
          ref={inspirationSummary}
          data-testid="note-inspiration-count"
          title="在主界面打开灵感"
          aria-label={`查看灵感，共${inspirationCount}条，目标${INSPIRATION_GOAL}条`}
          onClick={() => void openMainPage('inspiration')}
        >
          <svg className="note-progress-ring" viewBox="0 0 36 36" aria-hidden="true">
            <circle className="note-inspiration-track" cx="18" cy="18" r="16" />
            <circle
              className="note-progress-value note-inspiration-value"
              cx="18"
              cy="18"
              r="16"
              pathLength="100"
              strokeDasharray={`${Math.min(inspirationCount / INSPIRATION_GOAL, 1) * 100} 100`}
            />
          </svg>
          <span className="note-inspiration-count">{inspirationCount}</span>
        </button>
      </div>
      <footer className="task-footer" role="status">
        {added.saving || edited.saving ? '正在保存…' : ''}
      </footer>
    </section>
  )
}

import { MoreHorizontal, Sun } from 'lucide-react'
import { useDeleteConfirmation } from '../../components/DeleteConfirmation'
import { BackToList } from '../../components/BackToList'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from '../../components/ui/dropdown-menu'
import { AppIcon, TaskActionIcon } from '../../components/AppIcon'
import { SummaryRing } from '../../components/SummaryRing'
import { TaskCheck } from '../../components/TaskCheck'
import { Button } from '../../components/ui/button'
import { Textarea } from '../../components/ui/textarea'
import { ClearableInput } from '../../components/ui/clearable-input'
import { useSummaryMotion } from '../shared/useSummaryMotion'
import { ComposerToggle, InlineComposer } from '../shared/InlineComposer'
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
import { taskSummary as summarizeTasks } from './taskSummary'

const INSPIRATION_GOAL = 5

function focusTaskEditor(element: HTMLTextAreaElement | null) {
  if (!element) return
  element.focus({ preventScroll: true })
  element.setSelectionRange(element.value.length, element.value.length)
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
  const deletion = useDeleteConfirmation()
  const {
    today,
    archived,
    error,
    busy,
    setError,
    refresh,
    complete,
    remove,
    archive,
    restore,
    deleteArchived,
    skipHabit,
    convert,
    progress,
    addHabit,
    pin,
    move
  } = tasks
  const [page, setPage] = useState<MainPage>('task')
  const [adding, setAdding] = useState(false)
  const [taskComposerOpen, setTaskComposerOpen] = useState(false)
  const [habitComposerOpen, setHabitComposerOpen] = useState(false)
  const mainTaskInput = useRef<HTMLTextAreaElement>(null)
  const [expandedNoteGroups, setExpandedNoteGroups] = useState({ today: true, 'multi-day': false })
  const [archiveExpanded, setArchiveExpanded] = useState(false)
  const [draggingTask, setDraggingTask] = useState<Task | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; before: boolean } | null>(null)
  const noteInput = useRef<HTMLInputElement>(null)
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const [newKind, setNewKind] = useState<'task' | 'inspiration'>('task')
  const taskAdded = useTaskInput(today?.date, refresh, setError)
  const [loadedInspirationCount, setInspirationCount] = useState<number>()
  const inspirationCount = loadedInspirationCount ?? 0
  const habitCount =
    today?.tasks.filter((task) => task.habitId && task.date === today.date).length ?? 0
  const showMultiDay = desktop?.settings.showMultiDay ?? true
  const visibleTasks = today?.tasks.filter((task) => showMultiDay || task.kind === 'today') ?? []
  const { total, completed } = summarizeTasks(visibleTasks)
  const taskSummary = useSummaryMotion(kind === 'note' && today ? total : undefined, true)
  const inspirationSummary = useSummaryMotion(kind === 'note' ? loadedInspirationCount : undefined)
  const categoryCountVersion = useRef(0)
  const refreshCategoryCounts = useCallback(async () => {
    const version = ++categoryCountVersion.current
    try {
      const ideas = unwrap(await getDesktopApi().listInspirations())
      const date = new Date().toDateString()
      const count = ideas.filter(
        (idea) => idea.createdAt && new Date(idea.createdAt).toDateString() === date
      ).length
      if (version === categoryCountVersion.current) {
        setInspirationCount(count)
      }
    } catch (error) {
      if (version === categoryCountVersion.current)
        setError(error instanceof Error ? error.message : '读取分类数量失败。')
    }
  }, [setError])
  useEffect(() => {
    void refreshCategoryCounts()
    const unsubscribe = getDesktopApi().onTasksChanged(() => void refreshCategoryCounts())
    window.addEventListener('focus', refreshCategoryCounts)
    return () => {
      categoryCountVersion.current++
      unsubscribe()
      window.removeEventListener('focus', refreshCategoryCounts)
    }
  }, [refreshCategoryCounts])
  const inspirationAdded = useInspirationInput(
    async (text, id) =>
      unwrap(
        await (id
          ? getDesktopApi().updateInspiration(id, text)
          : getDesktopApi().createInspiration(text))
      ),
    refreshCategoryCounts,
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
    void getDesktopApi().setInteraction(
      deletion.open ||
        (kind === 'note' &&
          (inputFocused ||
            editing !== null ||
            inspirationEditing ||
            subitemEditing ||
            progressFocused ||
            draggingTask !== null ||
            busy))
    )
  }, [
    kind,
    inputFocused,
    editing,
    inspirationEditing,
    subitemEditing,
    progressFocused,
    draggingTask,
    busy,
    deletion.open
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
  const archiveList = (
    <>
      <button
        type="button"
        className="note-group-heading"
        data-note-group="archived"
        data-testid="task-archive-toggle"
        hidden={total === 0 && archived.length === 0}
        aria-expanded={archiveExpanded}
        onClick={() => setArchiveExpanded((expanded) => !expanded)}
      >
        <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
          <path
            d={archiveExpanded ? 'm3 4.5 3 3 3-3' : 'm4.5 3 3 3-3 3'}
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        已归档<span className="note-group-count">{archived.length}</span>
      </button>
      <div hidden={!archiveExpanded} aria-label="已归档任务">
        {archived.map((task) => (
          <div className="note-archive-row" key={task.id} data-archived-task-id={task.id}>
            <span className="note-archive-description" title={task.description}>
              {task.description}
            </span>
            <div className="note-archive-actions" tabIndex={-1} data-delete-focus-group>
              <button
                type="button"
                className="task-delete note-archive-delete"
                title="永久删除"
                aria-label={`永久删除：${task.description}`}
                disabled={busy}
                onClick={async () => {
                  if (
                    (await flush.current()) &&
                    (await deletion.confirm({
                      title: '删除归档任务',
                      description: '永久删除这项任务？',
                      detail: `${task.description}。任务及其子事项将被永久删除，无法恢复。`
                    }))
                  )
                    await deleteArchived(task.id)
                }}
              >
                <TaskActionIcon name="delete" />
              </button>
              <button
                type="button"
                className="task-pin"
                title="恢复任务"
                aria-label={`恢复：${task.description}`}
                disabled={busy}
                onClick={async () => {
                  if (await flush.current()) await restore(task.id)
                }}
              >
                <TaskActionIcon name="restore" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
  if (kind === 'main') {
    const selected = visibleTasks.find((task) => task.id === selectedTask)
    const navigate = async (next: typeof page) => {
      if (!(await flush.current())) return
      setPage(next)
      setNewKind(next === 'inspiration' ? 'inspiration' : 'task')
      setAdding(false)
      setSelectedTask(null)
      setError('')
    }
    return (
      <section className={`workbench page-${page}`} hidden={hidden}>
        <aside className="workbench-sidebar">
          <div className="workbench-brand">
            <span className="brand-mark">
              <AppIcon name="task" />
            </span>
            <div>
              <strong>myTodo</strong>
              <small>个人工作台</small>
            </div>
          </div>
          <nav className="workbench-nav" aria-label="主导航">
            {(
              [
                ['task', '任务'],
                ['habit', '习惯'],
                ['inspiration', '灵感']
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={`nav-category-${id}`}
                aria-label={label}
                aria-current={page === id ? 'page' : undefined}
                onClick={() => void navigate(id)}
              >
                <AppIcon name={id} />
                <span>{label}</span>
                <span className="nav-count" title={`今天的${label}数量`}>
                  {{ task: total, habit: habitCount, inspiration: inspirationCount }[id]}
                </span>
              </button>
            ))}
            <button
              className="nav-settings"
              data-testid="open-settings"
              aria-label="设置"
              aria-current={page === 'settings' ? 'page' : undefined}
              onClick={() => void navigate('settings')}
            >
              <AppIcon name="settings" />
              <span>设置</span>
            </button>
            <button
              data-testid="open-other"
              aria-label="打开桌面便签"
              onClick={() => void openOther()}
            >
              <AppIcon name="note" />
              <span>桌面便签</span>
              <span className="nav-arrow">↗</span>
            </button>
          </nav>
        </aside>
        <main
          tabIndex={-1}
          data-delete-focus-fallback
          className={`workbench-main ${page === 'inspiration' ? 'workbench-main-inspiration' : ''}`}
        >
          <header className="workbench-header">
            <div>
              <p className="workbench-date">
                {page === 'task' && today
                  ? new Date(`${today.date}T12:00:00`).toLocaleDateString('zh-CN', {
                      month: 'long',
                      day: 'numeric',
                      weekday: 'long'
                    })
                  : {
                      habit: '管理每天自动生成的任务',
                      inspiration: '',
                      settings: '',
                      task: '今天'
                    }[page]}
              </p>
              <h1>
                {{ task: '今天', habit: '习惯', inspiration: '灵感', settings: '设置' }[page]}
              </h1>
            </div>
            <div className="workbench-header-actions">
              {page === 'task' && (
                <span className="workbench-completion">
                  <strong>{completed}</strong> / {total} 已完成
                </span>
              )}
              {page !== 'settings' && page !== 'inspiration' && (
                <ComposerToggle
                  className="primary-button workbench-add"
                  label={page === 'habit' ? '新增习惯' : '新增任务'}
                  expanded={page === 'habit' ? habitComposerOpen : taskComposerOpen}
                  onClick={() => {
                    if (page === 'habit') setHabitComposerOpen(!habitComposerOpen)
                    else {
                      setTaskComposerOpen(!taskComposerOpen)
                      if (!taskComposerOpen)
                        requestAnimationFrame(() => mainTaskInput.current?.focus())
                    }
                  }}
                />
              )}
            </div>
          </header>
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
              <InlineComposer
                ref={mainTaskInput}
                expanded={taskComposerOpen}
                data-testid="task-new"
                aria-label="新增任务描述"
                placeholder="添加一个今天要做的事…"
                value={taskAdded.value}
                onValueChange={taskAdded.setValue}
                onSubmit={taskAdded.submit}
                submitLabel="添加任务"
                saving={taskAdded.saving}
                onCompositionStart={() => {
                  taskAdded.composing.current = true
                }}
                onCompositionEnd={taskAdded.endComposition}
              />
              {today && total === 0 && (
                <div className="workbench-empty">
                  <span className="empty-icon" aria-hidden="true">
                    ✓
                  </span>
                  <strong>给今天留个开始</strong>
                  <span>在上方记下第一项任务，按回车添加</span>
                </div>
              )}
              {Boolean(noteGroups.today.length) && (
                <div className="task-section-heading">
                  <span>今天任务</span>
                  <span>
                    {noteGroups.today.filter((task) => task.completed).length} /{' '}
                    {noteGroups.today.length}
                  </span>
                </div>
              )}
              {visibleTasks.map((task, index) => (
                <div
                  key={task.id}
                  data-task-id={task.id}
                  data-task-kind={task.kind}
                  className={`task-row ${task.completed ? 'completed' : ''} ${task.kind === 'multi-day' && visibleTasks[index - 1]?.kind !== 'multi-day' ? 'multi-day-start' : ''} ${selectedTask === task.id ? 'selected' : ''}`}
                >
                  {task.kind === 'multi-day' && visibleTasks[index - 1]?.kind !== 'multi-day' && (
                    <span className="group-label">
                      持续推进
                      <small>
                        {noteGroups['multi-day'].filter((item) => item.completed).length} /{' '}
                        {noteGroups['multi-day'].length}
                      </small>
                    </span>
                  )}
                  <TaskCheck
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
                    {task.habitId && (
                      <p className="task-meta habit-source">
                        <AppIcon name="habit" />
                        来自习惯
                      </p>
                    )}
                    {task.kind === 'multi-day' && (
                      <p className="task-meta">
                        <span className="task-mini-progress">
                          <span style={{ width: `${task.progress}%` }} />
                        </span>
                        {task.progress}%
                        {task.subitems?.length
                          ? ` · 子事项 ${task.subitems.filter((item) => item.completed).length}／${task.subitems.length}`
                          : ''}
                      </p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="task-more"
                        disabled={busy}
                        aria-label={`更多操作：${task.description}`}
                        title="更多操作"
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="task-actions-menu">
                      {task.kind === 'today' && !task.habitId && (
                        <>
                          <DropdownMenuItem
                            data-testid="task-convert"
                            onSelect={() => {
                              void (async () => {
                                if (await flush.current()) await convert(task.id)
                              })()
                            }}
                          >
                            <TaskActionIcon name="convert" />
                            转为多天任务
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            data-testid="task-to-habit"
                            onSelect={() => {
                              void (async () => {
                                if (await flush.current()) await addHabit(task.id)
                              })()
                            }}
                          >
                            <TaskActionIcon name="habit" />
                            添加为习惯
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuItem
                        onSelect={() => {
                          void (async () => {
                            if (await flush.current()) await pin(task)
                          })()
                        }}
                      >
                        <TaskActionIcon name={task.pinned ? 'unpin' : 'pin'} />
                        {task.pinned ? '取消置顶' : '置顶任务'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        data-testid="task-delete"
                        variant="destructive"
                        onSelect={(event) => {
                          const menu = (event.target as HTMLElement).closest('[role="menu"]')
                          const trigger = document.getElementById(
                            menu?.getAttribute('aria-labelledby') ?? ''
                          )
                          void (async () => {
                            if (await flush.current()) {
                              if (task.habitId) await skipHabit(task.id)
                              else if (
                                await deletion.confirm(
                                  {
                                    title: '删除任务',
                                    description: '永久删除这项任务？',
                                    detail: `${task.description}。任务及其子事项将被永久删除，无法恢复。`
                                  },
                                  trigger
                                )
                              )
                                await remove(task.id)
                            }
                          })()
                        }}
                      >
                        <TaskActionIcon name={task.habitId ? 'schedule' : 'delete'} />
                        {task.habitId ? '暂停一次' : '删除任务'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
              {archiveList}
            </div>
            {selected && (
              <aside className="workbench-detail" aria-label="任务详情">
                <BackToList
                  onClick={async () => {
                    if (await flush.current()) setSelectedTask(null)
                  }}
                />
                <h2>任务详情</h2>
                <label className="detail-label">任务描述</label>
                {editing === selected.id ? (
                  <Textarea
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
              composerOpen={habitComposerOpen}
              onComposerOpenChange={setHabitComposerOpen}
            />
          </div>
          <div className="workbench-inspiration-page" hidden={page !== 'inspiration'}>
            <InspirationPanel
              ref={inspirationPanel}
              report={setError}
              onEditingChange={setInspirationEditing}
              workbench
            />
          </div>
          <SettingsPage state={desktop} hidden={page !== 'settings'} />
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
        title={kind === 'note' ? '拖动到桌面边缘吸附' : undefined}
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

      <div className="task-list" aria-label="任务" tabIndex={-1} data-delete-focus-fallback>
        {today && total === 0 && (
          <div className="task-empty">
            <span aria-hidden="true">
              <Sun size={32} strokeWidth={1.4} />
            </span>
            <p>今天，留一点空间。</p>
          </div>
        )}
        {(['today', 'multi-day'] as const).map((group) => (
          <Fragment key={group}>
            <button
              type="button"
              className="note-group-heading"
              hidden={total === 0 || (group === 'multi-day' && !showMultiDay)}
              data-note-group={group}
              title={group === 'today' ? '今天需要完成' : '要花几天完成'}
              aria-expanded={expandedNoteGroups[group]}
              onClick={async () => {
                if (expandedNoteGroups[group] && !(await flush.current())) return
                setExpandedNoteGroups((groups) => ({
                  ...groups,
                  [group]: !groups[group]
                }))
              }}
            >
              <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
                <path
                  d={expandedNoteGroups[group] ? 'm3 4.5 3 3 3-3' : 'm4.5 3 3 3-3 3'}
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {group === 'today' ? '这就去做' : '持续推进'}
              <span className="note-group-count">
                {noteGroups[group].filter((item) => item.completed).length}/
                {noteGroups[group].length}
              </span>
            </button>
            {noteGroups[group].map((task) => (
              <div
                key={task.id}
                className={`task-row ${task.completed ? 'completed' : ''} ${draggingTask?.id === task.id ? 'is-dragging' : ''} ${dropTarget?.id === task.id ? (dropTarget.before ? 'drop-before' : 'drop-after') : ''}`}
                data-task-id={task.id}
                data-task-kind={task.kind}
                data-task-pinned={Boolean(task.pinned)}
                hidden={
                  !expandedNoteGroups[task.kind] || (task.kind === 'multi-day' && !showMultiDay)
                }
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
                <TaskCheck
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
                      title={
                        task.habitId ? '双击在主界面打开习惯，或按Enter打开' : task.description
                      }
                      disabled={busy}
                      onDoubleClick={() => {
                        if (task.habitId) void openMainPage('habit')
                      }}
                      onKeyDown={(event) => {
                        if (task.habitId && (event.key === 'Enter' || event.key === ' ')) {
                          event.preventDefault()
                          if (!event.repeat) void openMainPage('habit')
                        }
                      }}
                      onClick={async () => {
                        if (task.habitId) return
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
                    title={task.habitId ? '暂停一次' : '归档任务'}
                    disabled={busy}
                    aria-label={`${task.habitId ? '暂停一次' : '归档'}：${task.description}`}
                    onClick={async () => {
                      if (await flush.current()) {
                        if (task.habitId) await skipHabit(task.id)
                        else await archive(task.id)
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
            ))}
          </Fragment>
        ))}
        {archiveList}
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
                  <AppIcon
                    name={value}
                    lit={value === 'inspiration' && newKind === 'inspiration'}
                  />
                </button>
              ))}
            </div>
            <ClearableInput
              data-testid="task-new"
              aria-label={newKind === 'task' ? '新增任务描述' : '新增灵感'}
              placeholder={newKind === 'task' ? '写下任务…' : '写下灵感…'}
              data-new-kind={newKind}
              ref={noteInput}
              aria-hidden={!adding}
              tabIndex={adding ? 0 : -1}
              inert={!adding}
              value={added.value}
              onClear={() => added.setValue('')}
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
              <AppIcon name="add" />
            </button>
          </div>
        </form>

        <button
          type="button"
          className="note-summary note-task-summary"
          ref={taskSummary}
          title="在主界面打开任务"
          aria-label={`在主界面打开任务，已完成${completed}项，共${total}项`}
          onClick={() => void openMainPage('task')}
        >
          <SummaryRing value={completed} total={total} />
        </button>
        <button
          type="button"
          className="note-summary note-inspiration-summary"
          ref={inspirationSummary}
          data-testid="note-inspiration-count"
          title="今天的灵感，点击在主界面查看"
          aria-label={`今天的灵感，共${inspirationCount}条，目标${INSPIRATION_GOAL}条`}
          onClick={() => void openMainPage('inspiration')}
        >
          <SummaryRing value={inspirationCount} total={INSPIRATION_GOAL} inspiration />
        </button>
      </div>
      <footer className="task-footer" role="status">
        {added.saving || edited.saving ? '正在保存…' : ''}
      </footer>
    </section>
  )
}

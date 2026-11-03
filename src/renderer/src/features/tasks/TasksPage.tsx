import { CreatedTime } from '../shared/CreatedTime'
import { BrandMark } from '../../components/BrandMark'
import { Toast } from '../../components/Toast'
import {
  ArrowUpRight,
  ListTodo,
  MoreHorizontal,
  Pin,
  PinOff,
  Repeat,
  SkipForward,
  Sun,
  Trash2
} from 'lucide-react'
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
import { ListDescription } from '../shared/ListDescription'
import { ClearableInput } from '../../components/ui/clearable-input'
import { useSummaryMotion } from '../shared/useSummaryMotion'
import { ComposerToggle, InlineComposer } from '../shared/InlineComposer'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type {
  DesktopState,
  MainPage,
  WindowKind,
  Task,
  Inspiration
} from '../../../../shared/contracts'
import { NotePages } from './NotePages'
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

function noteDateLabel(date: string | undefined) {
  if (!date) return '正在读取…'
  const [year, month, day] = date.split('-').map(Number)
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][
    new Date(year, month - 1, day).getDay()
  ]
  return `${month}月${day}日 · ${weekday}`
}

function focusTaskEditor(element: HTMLTextAreaElement | null) {
  if (!element) return
  element.focus({ preventScroll: true })
  element.setSelectionRange(element.value.length, element.value.length)
  requestAnimationFrame(() => {
    if (!element.isConnected || document.activeElement !== element) return
    element.scrollLeft = element.scrollWidth
    element.scrollTop = element.scrollHeight
  })
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
  const [taskArchiveView, setTaskArchiveView] = useState(false)
  const [habitCounts, setHabitCounts] = useState({ current: 0, archived: 0 })
  const [habitArchiveView, setHabitArchiveView] = useState(false)
  const [habitComposerOpen, setHabitComposerOpen] = useState(false)
  const mainTaskInput = useRef<HTMLTextAreaElement>(null)
  const [expandedNoteGroups, setExpandedNoteGroups] = useState({ today: true, 'multi-day': false })
  const [archiveExpanded, setArchiveExpanded] = useState(false)
  const [draggingTask, setDraggingTask] = useState<Task | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; before: boolean } | null>(null)
  const noteInput = useRef<HTMLInputElement>(null)
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const [newKind, setNewKind] = useState<'task' | 'inspiration'>('task')
  const categorySwitch = useRef(0)
  const [todayIdeas, setTodayIdeas] = useState<Inspiration[]>([])
  const [archivedIdeas, setArchivedIdeas] = useState<Inspiration[]>([])
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
      const isToday = (idea: Inspiration) =>
        idea.createdAt && new Date(idea.createdAt).toDateString() === date
      const current = ideas.filter(isToday)
      const archivedItems: Inspiration[] = []
      if (kind === 'note') {
        let hasMore = true
        while (hasMore && version === categoryCountVersion.current) {
          const page = unwrap(
            await getDesktopApi().listInspirationPage(archivedItems.length, 100, {
              kind: 'archive'
            })
          )
          archivedItems.push(...page.items)
          hasMore = page.hasMore
        }
      }
      if (version === categoryCountVersion.current) {
        setArchivedIdeas(archivedItems.filter(isToday))
        setInspirationCount(current.length)
        setTodayIdeas(
          current.reverse().sort((a, b) => Date.parse(b.createdAt!) - Date.parse(a.createdAt!))
        )
      }
    } catch (error) {
      if (version === categoryCountVersion.current)
        setError(error instanceof Error ? error.message : '读取分类数量失败。')
    }
  }, [kind, setError])
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
  const [editingIdea, setEditingIdea] = useState<string | null>(null)
  const ideaEdited = useInspirationInput(
    async (text, id) => unwrap(await getDesktopApi().updateInspiration(id!, text)),
    refreshCategoryCounts,
    setError,
    () => setEditingIdea(null)
  )
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
    if (
      kind === 'note' &&
      !element?.closest('[data-testid="task-new"], .workbench-add, .note-add-controls')
    )
      void added.save()
    if (!element?.closest('[data-testid="task-edit"], .clearable-textarea')) void edited.save()
    if (!element?.closest('[data-testid="jotting-edit"]')) void ideaEdited.save()
  }
  flush.current = async () => {
    const results = await Promise.all([
      kind === 'note' ? taskAdded.save() : true,
      inspirationAdded.save(),
      edited.save(),
      ideaEdited.save(),
      habitSave.current(),
      inspirationPanel.current?.save() ?? true,
      ...Array.from(subitemSaves.current.values(), (save) => save())
    ])
    return results.every(Boolean)
  }
  useEffect(() => {
    const api = getDesktopApi()
    const unsubscribe = api.onSaveRequested(() => {
      deletion.cancel()
      return flush.current()
    })
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
  }, [deletion.cancel])
  useEffect(() => {
    void getDesktopApi().setInteraction(
      deletion.open ||
        (kind === 'note' &&
          (inputFocused ||
            editing !== null ||
            editingIdea !== null ||
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
    editingIdea,
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
        hidden={kind === 'main' || (total === 0 && archived.length === 0)}
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
      <div hidden={kind === 'main' ? !taskArchiveView : !archiveExpanded} aria-label="已归档任务">
        {kind === 'main' && archived.length === 0 && (
          <p className="inspiration-empty">还没有已归档任务。</p>
        )}
        {archived.map((task) => (
          <div className="note-archive-row" key={task.id} data-archived-task-id={task.id}>
            {kind === 'main' ? (
              <div className="task-content">
                <span className="note-archive-description" title={task.description}>
                  {task.description}
                </span>
                <p className="list-meta">
                  <CreatedTime value={task.createdAt} />
                </p>
              </div>
            ) : (
              <span className="note-archive-description" title={task.description}>
                {task.description}
              </span>
            )}
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
            <BrandMark />
            <div>
              <strong>DOOK</strong>
              <small>From DO to OK.</small>
            </div>
          </div>
          <nav id="main-navigation" className="workbench-nav" aria-label="主导航">
            {(
              [
                ['task', '任务'],
                ['habit', '习惯'],
                ['inspiration', '小记']
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
          </nav>
        </aside>
        <main
          tabIndex={-1}
          data-delete-focus-fallback
          className={`workbench-main ${page === 'inspiration' ? 'workbench-main-inspiration' : page === 'task' || page === 'habit' ? 'workbench-main-list-page' : ''}`}
        >
          <header className="workbench-header">
            <div className={page === 'task' ? 'workbench-task-heading' : undefined}>
              <p className="workbench-date">
                {page === 'task' && today
                  ? new Date(`${today.date}T12:00:00`).toLocaleDateString('zh-CN', {
                      month: 'long',
                      day: 'numeric',
                      weekday: 'long'
                    })
                  : {
                      habit: '',
                      inspiration: '',
                      settings: '',
                      task: '这就去做'
                    }[page]}
              </p>
              <h1 title={page === 'habit' ? '管理按周期自动生成的任务' : undefined}>
                {{ task: '今天', habit: '习惯', inspiration: '小记', settings: '设置' }[page]}
              </h1>
            </div>
            <div className="workbench-header-actions">
              {page !== 'settings' && page !== 'inspiration' && (
                <ComposerToggle
                  className="primary-button workbench-add"
                  label={page === 'habit' ? '新增习惯' : '新增任务'}
                  expanded={page === 'habit' ? habitComposerOpen : taskComposerOpen}
                  onClick={() => {
                    if (page === 'habit') {
                      setHabitArchiveView(false)
                      setHabitComposerOpen(!habitComposerOpen)
                    } else {
                      setTaskArchiveView(false)
                      setTaskComposerOpen(!taskComposerOpen)
                      if (!taskComposerOpen)
                        requestAnimationFrame(() => mainTaskInput.current?.focus())
                    }
                  }}
                />
              )}
            </div>
          </header>
          {(page === 'task' || page === 'habit') && (
            <div
              className="archive-view-switch"
              role="group"
              aria-label={page === 'task' ? '任务筛选' : '习惯筛选'}
            >
              {([false, true] as const).map((archived) => (
                <button
                  key={String(archived)}
                  type="button"
                  className="archive-filter"
                  aria-label={`${archived ? '已归档' : '当前'}${page === 'task' ? '任务' : '习惯'}`}
                  aria-pressed={(page === 'task' ? taskArchiveView : habitArchiveView) === archived}
                  onClick={async () => {
                    if ((page === 'task' ? taskArchiveView : habitArchiveView) === archived) return
                    if (!(await flush.current())) return
                    setSelectedTask(null)
                    if (page === 'task') {
                      setTaskArchiveView(archived)
                      setTaskComposerOpen(false)
                    } else {
                      setHabitArchiveView(archived)
                      setHabitComposerOpen(false)
                    }
                  }}
                >
                  <span>{archived ? '已归档' : page === 'task' ? '当前任务' : '当前'}</span>
                  <span
                    className="archive-filter-count"
                    title={page === 'task' && !archived ? '已完成／任务总数' : '数量'}
                  >
                    {page === 'task'
                      ? archived
                        ? tasks.archived.length
                        : `${completed}/${total}`
                      : archived
                        ? habitCounts.archived
                        : habitCounts.current}
                  </span>
                </button>
              ))}
            </div>
          )}
          <Toast message={error} onDismiss={() => setError('')} />
          <div
            className={`workbench-split ${selected ? 'has-detail' : ''}`}
            hidden={page !== 'task'}
          >
            <div className="workbench-list" aria-label="任务">
              <InlineComposer
                ref={mainTaskInput}
                expanded={taskComposerOpen && !taskArchiveView}
                onDismiss={() => setTaskComposerOpen(false)}
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
              {!taskArchiveView && today && total === 0 && (
                <div className="workbench-empty">
                  <span className="empty-icon" aria-hidden="true">
                    ✓
                  </span>
                  <strong>给今天留个开始</strong>
                  <span>在上方记下第一项任务，按回车添加</span>
                </div>
              )}
              {!taskArchiveView &&
                total > 0 &&
                (['today', 'multi-day'] as const)
                  .filter((group) => group === 'today' || showMultiDay)
                  .map((group) => (
                    <section
                      key={group}
                      className="task-card-group"
                      aria-labelledby={`task-card-${group}-title`}
                      data-task-card={group}
                    >
                      <header className="task-card-heading">
                        <h2 id={`task-card-${group}-title`}>
                          {group === 'today' ? '这就去做' : '持续推进'}
                        </h2>
                        <span className="task-card-count">
                          {noteGroups[group].filter((task) => task.completed).length}/
                          {noteGroups[group].length}
                        </span>
                      </header>
                      {noteGroups[group].length === 0 && (
                        <p className="task-card-empty">
                          {group === 'today' ? '暂时没有今天任务' : '暂时没有持续推进的任务'}
                        </p>
                      )}
                      {noteGroups[group].map((task) => (
                        <div
                          key={task.id}
                          data-task-id={task.id}
                          data-task-kind={task.kind}
                          className={`task-row main-list-row ${task.completed ? 'completed' : ''} ${selectedTask === task.id ? 'selected' : ''}`}
                        >
                          <TaskCheck
                            checked={task.completed}
                            disabled={busy}
                            aria-label={`完成：${task.description}`}
                            onChange={() => void complete(task)}
                          />
                          <div className="task-content">
                            <ListDescription
                              description={task.description}
                              editing={editing === task.id && selectedTask !== task.id}
                              draft={edited}
                              label="编辑任务描述"
                              testId="task-edit"
                              previewTestId="task-description"
                              className="task-description"
                              onEdit={async () => {
                                if (task.habitId) {
                                  await navigate('habit')
                                  return
                                }
                                if (!(await flush.current())) return
                                setSelectedTask(null)
                                setEditing(task.id)
                                edited.start(task)
                              }}
                            />
                            <p className="task-meta list-meta">
                              {task.kind === 'multi-day' && (
                                <>
                                  <span className="task-mini-progress">
                                    <span style={{ width: `${task.progress}%` }} />
                                  </span>
                                  <span>{task.progress}%</span>
                                  {task.subitems?.length ? (
                                    <span>
                                      · 子事项{' '}
                                      {task.subitems.filter((item) => item.completed).length}／
                                      {task.subitems.length}
                                    </span>
                                  ) : null}
                                  <span aria-hidden="true">·</span>
                                </>
                              )}
                              <CreatedTime value={task.createdAt} />
                            </p>
                          </div>
                          {task.habitId && (
                            <span
                              className="task-habit-indicator"
                              role="img"
                              aria-label="来自习惯"
                              title="来自习惯"
                            >
                              <TaskActionIcon name="schedule" />
                            </span>
                          )}
                          <DropdownMenu modal={false}>
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
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                data-testid="task-details"
                                onSelect={() => {
                                  void (async () => {
                                    if (await flush.current()) setSelectedTask(task.id)
                                  })()
                                }}
                              >
                                <ListTodo aria-hidden="true" />
                                任务详情
                              </DropdownMenuItem>
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
                                    <ArrowUpRight aria-hidden="true" />
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
                                    <Repeat aria-hidden="true" />
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
                                {task.pinned ? (
                                  <PinOff aria-hidden="true" />
                                ) : (
                                  <Pin aria-hidden="true" />
                                )}
                                {task.pinned ? '取消置顶' : '置顶任务'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                data-testid="task-delete"
                                variant="destructive"
                                onSelect={(event) => {
                                  const menu = (event.target as HTMLElement).closest(
                                    '[role="menu"]'
                                  )
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
                                {task.habitId ? (
                                  <SkipForward aria-hidden="true" />
                                ) : (
                                  <Trash2 aria-hidden="true" />
                                )}
                                {task.habitId ? '暂停一次' : '删除任务'}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ))}
                    </section>
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
                <SubitemsPanel
                  key={selected.id}
                  defaultExpanded
                  task={selected}
                  changed={refresh}
                  report={setError}
                  onSaveReady={onSubitemSaveReady}
                  onInteraction={onSubitemInteraction}
                />
              </aside>
            )}
          </div>
          <div className="workbench-habit-page" hidden={page !== 'habit'}>
            <HabitsPanel
              onSaveReady={onHabitSaveReady}
              archiveView={habitArchiveView}
              onCountsChange={setHabitCounts}
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
        <div className="note-heading-label">
          <p className="task-eyebrow">TODAY</p>
          <h1>{newKind === 'inspiration' ? '小记' : '今天'}</h1>
          <p className="task-date">
            {newKind === 'inspiration'
              ? `今天 · ${inspirationCount}条`
              : noteDateLabel(today?.date)}
          </p>
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

      <div className="note-page-divider" aria-hidden="true">
        <div
          className="note-page-divider-track"
          style={{ transform: newKind === 'task' ? 'translateX(0)' : 'translateX(-50%)' }}
        >
          <span />
          <span />
        </div>
      </div>
      <NotePages
        selected={newKind}
        ideas={todayIdeas}
        archivedIdeas={archivedIdeas}
        renderDescription={(idea) =>
          editingIdea === idea.id ? (
            <form
              className="task-edit-form"
              onSubmit={(event) => {
                event.preventDefault()
                void ideaEdited.submit()
              }}
            >
              <span className="task-description task-edit-mirror" aria-hidden="true">
                {ideaEdited.value || '\u200b'}
              </span>
              <textarea
                className="task-description task-edit-input"
                data-testid="jotting-edit"
                aria-label="编辑小记内容"
                rows={1}
                value={ideaEdited.value}
                ref={focusTaskEditor}
                onChange={(event) => ideaEdited.setValue(event.target.value)}
                onBlur={() => void ideaEdited.save()}
                onCompositionStart={() => {
                  ideaEdited.composing.current = true
                }}
                onCompositionEnd={ideaEdited.endComposition}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || event.keyCode === 229) return
                  if (event.key === 'Enter' && !event.ctrlKey) {
                    event.preventDefault()
                    void ideaEdited.submit()
                  }
                }}
              />
            </form>
          ) : (
            <button
              type="button"
              className="task-description"
              title={idea.description}
              onClick={async () => {
                if (!(await flush.current())) return
                ideaEdited.start(idea)
                setEditingIdea(idea.id)
                setError('')
              }}
            >
              {idea.description}
            </button>
          )
        }
        onRestore={(id) =>
          windowAction(async () => {
            if (!(await flush.current())) return
            unwrap(await getDesktopApi().restoreInspiration(id))
            await refreshCategoryCounts()
          })
        }
        onDelete={(idea) =>
          windowAction(async () => {
            if (!(await flush.current())) return
            if (
              !(await deletion.confirm({
                title: '永久删除小记',
                description: '永久删除这条小记？',
                detail: `${idea.description}。小记及其补充、主题关联将被永久删除，无法恢复。`
              }))
            )
              return
            unwrap(await getDesktopApi().deleteArchivedInspiration(idea.id))
            await refreshCategoryCounts()
          })
        }
        onArchive={(id) =>
          windowAction(async () => {
            if (!(await flush.current())) return
            unwrap(await getDesktopApi().archiveInspiration(id))
            await refreshCategoryCounts()
          })
        }
      >
        <div
          className="task-list"
          aria-label="任务"
          tabIndex={-1}
          data-delete-focus-fallback={newKind === 'task' ? true : undefined}
        >
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
      </NotePages>
      <Toast message={error} onDismiss={() => setError('')} />
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
                  title={value === 'task' ? '添加任务' : '添加小记'}
                  aria-label={value === 'task' ? '添加任务' : '添加小记'}
                  aria-pressed={newKind === value}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={async () => {
                    const request = ++categorySwitch.current
                    const switching = newKind !== value
                    if (switching) {
                      if (!(await flush.current()) || request !== categorySwitch.current) return
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
              aria-label={newKind === 'task' ? '新增任务描述' : '新增小记'}
              placeholder={newKind === 'task' ? '写下任务…' : '写下小记…'}
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
              title={newKind === 'task' ? '添加任务' : '添加小记'}
              aria-label={newKind === 'task' ? '添加任务' : '添加小记'}
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
          title="今天的小记，点击在主界面查看"
          aria-label={`今天的小记，共${inspirationCount}条，目标${INSPIRATION_GOAL}条`}
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

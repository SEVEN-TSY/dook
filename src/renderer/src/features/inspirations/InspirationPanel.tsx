import { CreatedTime } from '../shared/CreatedTime'
import { Toast } from '../../components/Toast'
import { TaskActionIcon } from '../../components/AppIcon'
import { Archive, CalendarPlus, CornerDownLeft, Tags, Pencil, Plus, X, Trash2 } from 'lucide-react'
import { ComposerToggle, InlineComposer } from '../shared/InlineComposer'
import { Popover, PopoverAnchor, PopoverContent } from '../../components/ui/popover'
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { Ref } from 'react'
import { INSPIRATION_TOPIC_NAME_MAX_LENGTH } from '../../../../shared/contracts'
import type { Inspiration, InspirationTopic } from '../../../../shared/contracts'
import { getDesktopApi, unwrap } from '../../platform/desktop'
import { useInspirationInput } from './useInspirationInput'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import { ListDescription } from '../shared/ListDescription'
import { ClearableInput } from '../../components/ui/clearable-input'
import { useDeleteConfirmation } from '../../components/DeleteConfirmation'
import { useSerialSave } from '../shared/useSerialSave'

type TopicRenameDraft = { id: string; name: string; saved: string }

export interface InspirationPanelHandle {
  save: () => Promise<boolean>
}

export function InspirationPanel({
  ref,
  report,
  onEditingChange,
  workbench = false,
  collapsible = false
}: {
  ref: Ref<InspirationPanelHandle>
  report: (message: string) => void
  onEditingChange: (active: boolean) => void
  workbench?: boolean
  collapsible?: boolean
}) {
  const deletion = useDeleteConfirmation()
  const FormInput = workbench ? Input : ClearableInput
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null)
  const notifyError = (message: string) => {
    if (!workbench) {
      report(message)
      return
    }
    if (message) setNotice({ message, error: true })
    report('')
  }
  const notifySuccess = (message: string) => setNotice({ message, error: false })
  const [ideas, setIdeas] = useState<Inspiration[]>([])
  const [view, setView] = useState<'date' | 'topic'>('topic')
  const [topics, setTopics] = useState<InspirationTopic[]>([])
  const [picker, updatePicker] = useState<string | null>(null)
  const [pickerIdea, setPickerIdea] = useState<Inspiration | null>(null)
  const pickerCurrent = useRef<string | null>(null)
  const pickerSession = useRef(0)
  const pickerDraftVersion = useRef(0)
  const pickerButton = useRef<HTMLButtonElement | null>(null)
  const pickerAnchor = useRef<{ getBoundingClientRect: () => DOMRect } | null>(null)
  const [pickerError, setPickerError] = useState('')
  const [pickerCreating, setPickerCreating] = useState(false)
  const pickerCreatingSession = useRef<number | null>(null)
  const setPicker = (value: string | null) => {
    ++pickerSession.current
    pickerCurrent.current = value
    updatePicker(value)
    setNewTopic('')
    setTopicSearch('')
    setPickerError('')
    setPickerCreating(false)
    pickerCreatingSession.current = null
    if (!value) setPickerIdea(null)
  }
  const [newTopic, setNewTopic] = useState('')
  const [creatingTopic, setCreatingTopic] = useState(false)
  const [topicName, setTopicName] = useState('')
  const [topicSearch, setTopicSearch] = useState('')
  const pendingTopics = useRef(0)
  const topicQueue = useRef<Promise<void>>(Promise.resolve())
  const refreshCurrent = useRef<() => Promise<void>>(async () => {})
  const renameDraft = useRef<TopicRenameDraft | null>(null)
  const [, redrawRename] = useState(0)
  const setRenameDraft = (draft: TopicRenameDraft | null) => {
    renameDraft.current = draft
    redrawRename((value) => value + 1)
  }
  const setRenameValue = (name: string) => {
    if (!renameDraft.current) return
    renameDraft.current.name = name
    redrawRename((value) => value + 1)
  }
  const topicForm = useRef<HTMLFormElement>(null)
  const topicEditVersion = useRef(0)
  const cancelTopicCreation = () => {
    ++topicEditVersion.current
    setCreatingTopic(false)
    setTopicName('')
  }
  useEffect(() => {
    if (!creatingTopic) return
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (!topicForm.current?.contains(event.target)) cancelTopicCreation()
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [creatingTopic])
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [archiveTodayExpanded, setArchiveTodayExpanded] = useState(true)
  const [archiveHistoryExpanded, setArchiveHistoryExpanded] = useState(false)
  const [dateGroup, setDateGroup] = useState(() => dateKey(new Date()))
  const [topicGroup, setTopicGroup] = useState('unassigned')
  const groupKey = view === 'date' ? dateGroup : topicGroup
  const scrollPositions = useRef({ date: 0, topic: 0 })
  const loadedByView = useRef({ date: 20, topic: 20 })
  const listRef = useRef<HTMLDivElement>(null)
  const newIdeaField = useRef<HTMLTextAreaElement>(null)
  const [creatingIdea, setCreatingIdea] = useState(false)
  const restoringScroll = useRef(false)
  const pendingScroll = useRef<number | null>(null)
  const loading = useRef(false)
  const loadedCount = useRef(20)
  const [editing, setEditing] = useState<string | null>(null)
  const version = useRef(0)
  const groupNavigation = useRef(0)
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - index)
    return dateKey(date)
  })
  const groupQuery = () => {
    if (view === 'topic')
      return groupKey === 'unassigned'
        ? { kind: 'unassigned' as const }
        : { kind: 'topic' as const, topicId: groupKey }
    if (groupKey === 'archive') return { kind: 'archive' as const }
    const start = new Date(groupKey === 'history' ? `${dates[6]}T00:00:00` : `${groupKey}T00:00:00`)
    const end = new Date(groupKey === 'history' ? `${dates[0]}T00:00:00` : `${groupKey}T00:00:00`)
    end.setDate(end.getDate() + 1)
    return {
      kind: groupKey === 'history' ? ('history' as const) : ('date' as const),
      start: start.toISOString(),
      end: end.toISOString()
    }
  }
  const refresh = async () => {
    if (pendingTopics.current) return
    const request = ++version.current
    try {
      if (workbench) {
        const topicList = unwrap(await getDesktopApi().listInspirationTopics())
        if (
          view === 'topic' &&
          groupKey !== 'unassigned' &&
          !topicList.some((topic) => topic.id === groupKey)
        ) {
          if (version.current === request) {
            ++version.current
            setPicker(null)
            setIdeas([])
            setTopics(topicList)
            setTopicGroup('unassigned')
          }
          return
        }
        const activePicker = pickerCurrent.current
        const activeSession = pickerSession.current
        const activeIdea = activePicker
          ? unwrap(await getDesktopApi().listInspirations()).find((item) =>
              activePicker.endsWith(`:${item.id}`)
            )
          : undefined
        const items: Inspiration[] = []
        let hasMore = true
        while ((groupKey === 'archive' || items.length < loadedCount.current) && hasMore) {
          const result = unwrap(
            await getDesktopApi().listInspirationPage(
              items.length,
              groupKey === 'archive' ? 100 : Math.min(100, loadedCount.current - items.length),
              groupQuery()
            )
          )
          items.push(...result.items)
          hasMore = result.hasMore
        }
        if (version.current === request) {
          pendingScroll.current = scrollPositions.current[view]
          setIdeas(items)
          if (activePicker && activeSession === pickerSession.current) {
            if (activeIdea) setPickerIdea(activeIdea)
            else setPicker(null)
          }
          setTopics(topicList)
          setHasMore(hasMore)
        }
      } else {
        const result = unwrap(await getDesktopApi().listInspirations())
        if (version.current === request) setIdeas(result)
      }
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '读取小记失败。')
    }
  }
  refreshCurrent.current = refresh
  const loadMore = async () => {
    if (loading.current || !hasMore) return
    loading.current = true
    const request = version.current
    try {
      const result = unwrap(
        await getDesktopApi().listInspirationPage(ideas.length, 20, groupQuery())
      )
      if (version.current === request) {
        setIdeas((current) => [...current, ...result.items])
        loadedCount.current = ideas.length + result.items.length
        setHasMore(result.hasMore)
      }
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '读取小记失败。')
    } finally {
      loading.current = false
    }
  }
  useLayoutEffect(() => {
    if (pendingScroll.current === null) return
    if (listRef.current) listRef.current.scrollTop = pendingScroll.current
    pendingScroll.current = null
    restoringScroll.current = false
  }, [ideas])
  const newIdea = useInspirationInput(
    async (text, id, key) => {
      const result = id
        ? unwrap(await getDesktopApi().updateInspiration(id, text))
        : unwrap(
            await getDesktopApi().createInspiration(
              text,
              view === 'topic' && groupKey !== 'unassigned' ? groupKey : undefined,
              key
            )
          )
      return result
    },
    refresh,
    notifyError,
    () => notifySuccess('小记已保存')
  )
  const original = useInspirationInput(
    async (text, id) => {
      if (!id) throw new Error('小记不存在。')
      const result = unwrap(await getDesktopApi().updateInspiration(id, text))
      if (workbench) notifySuccess('小记已保存')
      return result
    },
    refresh,
    notifyError,
    () => setEditing(null)
  )
  const rename = useSerialSave(
    renameDraft,
    async (draft) => {
      if (!draft) return 'done'
      const name = draft.name.trim()
      if (name === draft.saved) {
        setRenameDraft(null)
        return 'done'
      }
      unwrap(await getDesktopApi().renameInspirationTopic(draft.id, name))
      draft.saved = name
      if (renameDraft.current === draft) notifySuccess('主题已修改')
      void refreshCurrent.current()
      return 'continue'
    },
    notifyError,
    '修改主题失败。'
  )
  const save = async () =>
    (await Promise.all([original.save(), newIdea.save(), !renameDraft.current || rename.save()])).every(
      Boolean
    )
  const queueTopicChange = (action: () => Promise<void>, onSettled?: () => void) => {
    const session = pickerSession.current
    ++pendingTopics.current
    ++version.current
    topicQueue.current = topicQueue.current.then(async () => {
      try {
        if (!(await save())) return
        await action()
      } catch (error) {
        if (session === pickerSession.current)
          setPickerError(error instanceof Error ? error.message : '归集失败。')
      } finally {
        onSettled?.()
        if (--pendingTopics.current === 0) void refreshCurrent.current()
      }
    })
  }
  useImperativeHandle(ref, () => ({ save }))
  useEffect(() => {
    setCreatingIdea(false)
    void refresh()
    const unsubscribe = getDesktopApi().onTasksChanged(() => void refresh())
    return () => {
      ++version.current
      unsubscribe()
    }
  }, [view, groupKey])
  useEffect(() => {
    onEditingChange(editing !== null)
  }, [editing, onEditingChange])
  const groups = workbench
    ? view === 'topic'
      ? [
          {
            key: 'unassigned',
            label: '无主题',
            items: ideas
          },
          ...topics.map((topic) => ({
            key: topic.id,
            label: topic.name,
            items: ideas
          }))
        ]
      : [
          ...dates.map((date, index) => ({
            key: date,
            label: index === 0 ? '今天' : date,
            items: ideas
          })),
          {
            key: 'history',
            label: '一周以前',
            items: ideas
          },
          { key: 'archive', label: '已归档', items: ideas }
        ]
    : [{ key: 'all', label: '', items: ideas }]
  return (
    <section
      className={`inspiration-panel ${workbench ? 'inspiration-workbench' : ''}`}
      aria-label="小记"
    >
      {workbench && (
        <Toast
          message={notice?.message ?? ''}
          error={notice?.error}
          onDismiss={() => setNotice(null)}
        />
      )}
      {(!workbench || collapsible) && (
        <button
          className="inspiration-heading"
          data-testid="inspirations-toggle"
          aria-expanded={expanded}
          onClick={async () => {
            if (!(await save())) return
            setExpanded(!expanded)
          }}
        >
          <span>{expanded ? '⌄' : '›'} 小记</span>
          <span data-testid="inspiration-count">{ideas.length}</span>
        </button>
      )}
      {workbench && (
        <aside className="inspiration-navigation">
          <div className="inspiration-views" role="group" aria-label="小记视角">
            {(['topic', 'date'] as const).map((option) => (
              <button
                key={option}
                aria-pressed={view === option}
                onClick={async () => {
                  if (option === view || !(await save())) return
                  scrollPositions.current[view] = listRef.current?.scrollTop ?? 0
                  loadedByView.current[view] = loadedCount.current
                  ++version.current
                  restoringScroll.current = true
                  setIdeas([])
                  loadedCount.current = loadedByView.current[option]
                  setPicker(null)
                  setView(option)
                }}
              >
                {option === 'date' ? '日期' : '主题'}
              </button>
            ))}
          </div>
          {groups.map((group) => (
            <div className="inspiration-nav-item" key={group.key}>
              <button
                className="inspiration-heading"
                title={group.label}
                aria-current={group.key === groupKey ? 'true' : undefined}
                onClick={async () => {
                  const navigation = ++groupNavigation.current
                  if (group.key === groupKey || !(await save())) return
                  if (navigation !== groupNavigation.current) return
                  ++version.current
                  setIdeas([])
                  loadedCount.current = 20
                  loadedByView.current[view] = 20
                  setPicker(null)
                  scrollPositions.current[view] = 0
                  if (listRef.current) listRef.current.scrollTop = 0
                  if (view === 'date') setDateGroup(group.key)
                  else setTopicGroup(group.key)
                }}
              >
                {group.label}
              </button>
              {view === 'topic' && group.key === 'unassigned' && (
                <div className="inspiration-topic-create">
                  {creatingTopic ? (
                    <form
                      ref={topicForm}
                      className="inspiration-topic-form"
                      onSubmit={async (event) => {
                        event.preventDefault()
                        const editVersion = topicEditVersion.current
                        const navigation = groupNavigation.current
                        if (!(await save())) return
                        try {
                          const topic = unwrap(
                            await getDesktopApi().createInspirationTopic(topicName)
                          )
                          if (
                            editVersion !== topicEditVersion.current ||
                            navigation !== groupNavigation.current
                          ) {
                            void refreshCurrent.current()
                            return
                          }
                          setCreatingTopic(false)
                          setTopicName('')
                          ++version.current
                          setPicker(null)
                          setIdeas([])
                          setTopicGroup(topic.id)
                          notifySuccess('主题已创建')
                          void refresh()
                        } catch (error) {
                          if (editVersion === topicEditVersion.current)
                            notifyError(error instanceof Error ? error.message : '创建主题失败。')
                        }
                      }}
                    >
                      <ClearableInput
                        aria-label="新增主题名称"
                        placeholder="主题名称"
                        maxLength={INSPIRATION_TOPIC_NAME_MAX_LENGTH}
                        value={topicName}
                        onClear={() => {
                          ++topicEditVersion.current
                          setTopicName('')
                        }}
                        onChange={(event) => {
                          ++topicEditVersion.current
                          setTopicName(event.target.value)
                        }}
                        autoFocus
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            cancelTopicCreation()
                          }
                        }}
                      />
                      <button
                        type="submit"
                        aria-label="创建主题"
                        title="创建主题"
                        disabled={!topicName.trim()}
                      >
                        <CornerDownLeft size={15} />
                      </button>
                    </form>
                  ) : (
                    <button
                      aria-label="新增主题"
                      title="新增主题"
                      onClick={async () => {
                        if (renameDraft.current && !(await rename.save())) return
                        setCreatingTopic(true)
                      }}
                    >
                      <Plus size={14} />
                    </button>
                  )}
                </div>
              )}
              {view === 'topic' &&
                group.key !== 'unassigned' &&
                (renameDraft.current?.id === group.key ? (
                  <form
                    className="inspiration-topic-form"
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) void rename.save()
                    }}
                    onSubmit={(event) => {
                      event.preventDefault()
                      if (!rename.composing.current) void rename.save()
                    }}
                  >
                    <ClearableInput
                      aria-label="主题名称"
                      maxLength={INSPIRATION_TOPIC_NAME_MAX_LENGTH}
                      value={renameDraft.current.name}
                      onClear={() => setRenameValue('')}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onCompositionStart={() => {
                        rename.composing.current = true
                      }}
                      onCompositionEnd={(event) => {
                        setRenameValue(event.currentTarget.value)
                        rename.endComposition()
                      }}
                      autoFocus
                      onKeyDown={(event) => {
                        if (event.key !== 'Escape' || event.nativeEvent.isComposing) return
                        rename.resetComposition()
                        setRenameDraft(null)
                      }}
                    />
                    <button
                      type="submit"
                      aria-label="保存主题名称"
                      title="保存"
                      disabled={!renameDraft.current.name.trim()}
                    >
                      <CornerDownLeft size={15} />
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      aria-label={`重命名${group.label}`}
                      title="重命名"
                      onClick={async () => {
                        if (renameDraft.current && !(await rename.save())) return
                        if (creatingTopic) cancelTopicCreation()
                        setRenameDraft({ id: group.key, name: group.label, saved: group.label })
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      aria-label={`删除${group.label}`}
                      title="删除主题"
                      onClick={async () => {
                        if (topicGroup === group.key && !(await save())) return
                        try {
                          const topic = unwrap(
                            await getDesktopApi().inspirationTopicDetails(group.key)
                          )
                          if (
                            !(await deletion.confirm({
                              title: '删除主题',
                              description: `删除主题“${topic.name}”？`,
                              detail: `关联的${topic.count}条小记及其内容会保留。`
                            }))
                          )
                            return
                          const deleted = unwrap(
                            await getDesktopApi().deleteInspirationTopic(group.key)
                          )
                          if (!deleted) return
                          if (topicGroup === group.key) {
                            ++version.current
                            setIdeas([])
                            setPicker(null)
                            setTopicGroup('unassigned')
                          }
                          notifySuccess('主题已删除')
                          void refresh()
                        } catch (error) {
                          notifyError(error instanceof Error ? error.message : '删除主题失败。')
                        }
                      }}
                    >
                      <X size={13} />
                    </button>
                  </>
                ))}
            </div>
          ))}
        </aside>
      )}
      {(expanded || (workbench && !collapsible)) && (
        <div
          className="inspiration-list"
          ref={listRef}
          onScroll={(event) => {
            const target = event.currentTarget
            if (!restoringScroll.current) scrollPositions.current[view] = target.scrollTop
            if (target.scrollTop + target.clientHeight >= target.scrollHeight - 80) void loadMore()
          }}
        >
          {groups
            .filter((group) => !workbench || group.key === groupKey)
            .flatMap((group) => {
              if (!workbench || group.key !== 'archive') return [{ ...group, expanded: true }]
              const archivedToday = (idea: Inspiration) =>
                Boolean(idea.archivedAt && dateKey(new Date(idea.archivedAt)) === dates[0])
              return [
                {
                  key: 'archive-today',
                  label: '今天',
                  items: group.items.filter(archivedToday),
                  expanded: archiveTodayExpanded
                },
                {
                  key: 'archive-history',
                  label: '历史',
                  items: group.items.filter((idea) => !archivedToday(idea)),
                  expanded: archiveHistoryExpanded
                }
              ]
            })
            .map((group) => (
              <div
                key={group.key}
                className={groupKey === 'archive' ? 'task-archive-group' : 'inspiration-date-group'}
              >
                {workbench && groupKey === 'archive' ? (
                  <header className="task-card-heading">
                    <h2>
                      <button
                        type="button"
                        className="task-archive-toggle"
                        aria-expanded={group.expanded}
                        onClick={() => {
                          const toggle =
                            group.key === 'archive-history'
                              ? setArchiveHistoryExpanded
                              : setArchiveTodayExpanded
                          toggle((expanded) => !expanded)
                        }}
                      >
                        <svg
                          viewBox="0 0 12 12"
                          width="12"
                          height="12"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d={group.expanded ? 'm3 4.5 3 3 3-3' : 'm4.5 3 3 3-3 3'}
                            stroke="currentColor"
                            strokeWidth="1.3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {group.label}
                        <span className="task-card-count">{group.items.length}</span>
                      </button>
                    </h2>
                  </header>
                ) : (
                  workbench && (
                    <>
                      <div className="inspiration-group-header">
                        <h2 className="inspiration-group-title">{group.label}</h2>
                        <span className="inspiration-group-count">
                          {ideas.length}
                          {hasMore ? '+' : ''}条小记
                        </span>
                        {(view === 'topic' || groupKey === dates[0]) && (
                          <ComposerToggle
                            label="新增小记"
                            expanded={creatingIdea}
                            onClick={() => {
                              setCreatingIdea(!creatingIdea)
                              if (!creatingIdea)
                                requestAnimationFrame(() => newIdeaField.current?.focus())
                            }}
                          />
                        )}
                      </div>
                      {creatingIdea && (view === 'topic' || groupKey === dates[0]) && (
                        <InlineComposer
                          ref={newIdeaField}
                          onDismiss={() => setCreatingIdea(false)}
                          autoFocus
                          tone="inspiration"
                          multiline
                          aria-label="新增小记内容"
                          placeholder="记下一个想法…"
                          value={newIdea.value}
                          onValueChange={newIdea.setValue}
                          onClear={() => newIdea.setValue('')}
                          onSubmit={newIdea.submit}
                          submitLabel="记录小记"
                          saving={newIdea.saving}
                          onCompositionStart={() => {
                            newIdea.composing.current = true
                          }}
                          onCompositionEnd={newIdea.endComposition}
                        />
                      )}
                    </>
                  )
                )}
                {group.expanded && group.items.length === 0 && (
                  <p className={groupKey === 'archive' ? 'task-card-empty' : 'inspiration-empty'}>
                    {groupKey === 'archive'
                      ? group.label === '今天'
                        ? '今天还没有归档小记。'
                        : '还没有历史归档小记。'
                      : workbench
                        ? '还没有小记。'
                        : '在下方切换为小记，记下新的想法。'}
                  </p>
                )}
                {(group.expanded ? group.items : []).map((idea) => (
                  <article
                    key={idea.id}
                    data-inspiration-id={idea.id}
                    className={workbench ? 'inspiration-item list-row-divider' : 'inspiration-item'}
                  >
                    {workbench && groupKey === 'archive' ? (
                      <div className="note-archive-row">
                        <div className="task-content">
                          <span className="note-archive-description" title={idea.description}>
                            {idea.description}
                          </span>
                          <p className="list-meta task-archive-times">
                            <span className="task-archive-time">
                              <span title="归档时间">
                                <Archive size={12} aria-hidden="true" />
                              </span>
                              <CreatedTime value={idea.archivedAt} label="归档时间" />
                            </span>
                            <span className="task-archive-time">
                              <span title="创建时间">
                                <CalendarPlus size={12} aria-hidden="true" />
                              </span>
                              <CreatedTime value={idea.createdAt} label="创建时间" />
                            </span>
                          </p>
                        </div>
                        <div className="note-archive-actions" tabIndex={-1} data-delete-focus-group>
                          <button
                            className="task-delete note-archive-delete"
                            title="永久删除小记"
                            aria-label="永久删除小记"
                            onClick={async () => {
                              try {
                                if (
                                  !(await deletion.confirm({
                                    title: '永久删除小记',
                                    description: '永久删除这条小记？',
                                    detail: '小记及其补充、主题关联将被永久删除，无法恢复。'
                                  }))
                                )
                                  return
                                if (
                                  !unwrap(await getDesktopApi().deleteArchivedInspiration(idea.id))
                                )
                                  return
                                notifySuccess('小记已删除')
                                void refresh()
                              } catch (error) {
                                notifyError(error instanceof Error ? error.message : '删除失败。')
                              }
                            }}
                          >
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                          <button
                            className="task-pin"
                            title="恢复小记"
                            aria-label="恢复小记"
                            onClick={async () => {
                              try {
                                unwrap(await getDesktopApi().restoreInspiration(idea.id))
                                notifySuccess('小记已恢复')
                                void refresh()
                              } catch (error) {
                                notifyError(error instanceof Error ? error.message : '恢复失败。')
                              }
                            }}
                          >
                            <TaskActionIcon name="restore" />
                          </button>
                        </div>
                      </div>
                    ) : workbench ? (
                      <div className="inspiration-row main-list-row">
                        <div className="main-list-content">
                          <ListDescription
                            description={idea.description}
                            editing={editing === idea.id && editingGroup === group.key}
                            draft={original}
                            label="编辑原始想法"
                            testId="inspiration-edit"
                            previewTestId="inspiration-summary"
                            className="inspiration-summary"
                            onEdit={async () => {
                              if (!(await save())) return
                              original.start(idea)
                              setEditing(idea.id)
                              setEditingGroup(group.key)
                            }}
                          />
                          <p className="list-meta">
                            <CreatedTime value={idea.createdAt} />
                          </p>
                        </div>
                        <div className="inspiration-row-actions">
                          <div className="inspiration-topic-control">
                            <button
                              type="button"
                              className="inspiration-supplement"
                              aria-label="归集主题"
                              title="归集主题"
                              aria-expanded={picker === `${group.key}:${idea.id}`}
                              aria-controls={
                                picker === `${group.key}:${idea.id}`
                                  ? 'inspiration-topic-picker'
                                  : undefined
                              }
                              data-state={picker === `${group.key}:${idea.id}` ? 'open' : 'closed'}
                              onClick={(event) => {
                                if (picker === `${group.key}:${idea.id}`) {
                                  setPicker(null)
                                  return
                                }
                                const button = event.currentTarget
                                const rect = button.getBoundingClientRect()
                                pickerButton.current = button
                                pickerAnchor.current = {
                                  getBoundingClientRect: () =>
                                    button.isConnected ? button.getBoundingClientRect() : rect
                                }
                                setPicker(`${group.key}:${idea.id}`)
                                setPickerIdea(idea)
                              }}
                            >
                              <Tags size={15} />
                            </button>
                          </div>
                          <button
                            className="inspiration-supplement"
                            title="归档小记"
                            aria-label="归档小记"
                            onClick={async () => {
                              if (!(await save())) return
                              try {
                                unwrap(await getDesktopApi().archiveInspiration(idea.id))
                                notifySuccess('小记已归档')
                                void refresh()
                              } catch (error) {
                                notifyError(error instanceof Error ? error.message : '归档失败。')
                              }
                            }}
                          >
                            <Archive size={15} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="inspiration-summary">{idea.description}</p>
                    )}
                  </article>
                ))}
              </div>
            ))}
          {workbench && hasMore && (
            <button className="inspiration-heading" onClick={() => void loadMore()}>
              加载更多
            </button>
          )}
        </div>
      )}
      {workbench && picker && pickerIdea && (
        <Popover
          open
          onOpenChange={(open) => {
            if (!open) setPicker(null)
          }}
        >
          <PopoverAnchor virtualRef={pickerAnchor} />
          <PopoverContent
            id="inspiration-topic-picker"
            showArrow
            align="end"
            sideOffset={6}
            className="action-popover inspiration-topic-picker w-[236px] max-w-[calc(100vw-24px)] p-3"
            aria-label="选择主题"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              if (pickerButton.current?.isConnected) pickerButton.current.focus()
            }}
          >
            <div className="inspiration-topic-picker-body">
              <div className="action-popover-header inspiration-topic-picker-header">
                <span>归集主题</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="bg-transparent hover:bg-transparent dark:hover:bg-transparent"
                  aria-label="关闭主题归集"
                  title="关闭主题归集"
                  onClick={() => setPicker(null)}
                >
                  <X size={14} />
                </Button>
              </div>
              <FormInput
                aria-label="搜索主题"
                className="h-[34px] bg-transparent text-xs shadow-none focus-visible:ring-0"
                placeholder="搜索主题"
                value={topicSearch}
                onClear={() => setTopicSearch('')}
                onChange={(event) => setTopicSearch(event.target.value)}
                autoFocus
              />
              <div className="inspiration-topic-picker-options">
                {topics
                  .filter((topic) =>
                    topic.name.toLocaleLowerCase().includes(topicSearch.trim().toLocaleLowerCase())
                  )
                  .sort(
                    (a, b) =>
                      Number(pickerIdea.topicIds.includes(b.id)) -
                      Number(pickerIdea.topicIds.includes(a.id))
                  )
                  .map((topic) => (
                    <label key={topic.id}>
                      <input
                        type="checkbox"
                        checked={pickerIdea.topicIds.includes(topic.id)}
                        onChange={(event) => {
                          const checked = event.target.checked
                          const ideaId = pickerIdea.id
                          const session = pickerSession.current
                          setPickerIdea((current) =>
                            !current
                              ? null
                              : {
                                  ...current,
                                  topicIds: checked
                                    ? [
                                        ...current.topicIds.filter((id) => id !== topic.id),
                                        topic.id
                                      ]
                                    : current.topicIds.filter((id) => id !== topic.id)
                                }
                          )
                          queueTopicChange(async () => {
                            unwrap(
                              await getDesktopApi().setInspirationTopic(ideaId, topic.id, checked)
                            )
                            if (session === pickerSession.current) notifySuccess('主题已更新')
                          })
                        }}
                      />
                      {topic.name}
                    </label>
                  ))}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  const name = newTopic
                  if (!name.trim() || pickerCreatingSession.current === pickerSession.current)
                    return
                  const ideaId = pickerIdea.id
                  const session = pickerSession.current
                  const draftVersion = pickerDraftVersion.current
                  setPickerError('')
                  pickerCreatingSession.current = session
                  setPickerCreating(true)
                  queueTopicChange(
                    async () => {
                      try {
                        unwrap(await getDesktopApi().createInspirationTopic(name, ideaId))
                        if (
                          session === pickerSession.current &&
                          draftVersion === pickerDraftVersion.current
                        ) {
                          setPicker(null)
                          notifySuccess('主题已创建')
                        }
                      } catch (error) {
                        if (
                          session === pickerSession.current &&
                          draftVersion === pickerDraftVersion.current
                        )
                          setPickerError(error instanceof Error ? error.message : '创建主题失败。')
                      }
                    },
                    () => {
                      if (session === pickerSession.current) {
                        pickerCreatingSession.current = null
                        setPickerCreating(false)
                      }
                    }
                  )
                }}
              >
                <div className="inspiration-topic-picker-entry">
                  <FormInput
                    aria-label="新主题名称"
                    maxLength={INSPIRATION_TOPIC_NAME_MAX_LENGTH}
                    className="h-7 rounded-none border-0 bg-transparent text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
                    value={newTopic}
                    onClear={() => {
                      ++pickerDraftVersion.current
                      setNewTopic('')
                    }}
                    onChange={(event) => {
                      ++pickerDraftVersion.current
                      setNewTopic(event.target.value)
                    }}
                    placeholder="新主题"
                  />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon-xs"
                    className="bg-transparent hover:bg-transparent dark:hover:bg-transparent"
                    aria-label="创建并归集"
                    title="创建并归集"
                    disabled={!newTopic.trim() || pickerCreating}
                  >
                    <CornerDownLeft size={15} />
                  </Button>
                </div>
              </form>
              {pickerError && (
                <p className="inspiration-topic-error" role="alert">
                  {pickerError}
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </section>
  )
}

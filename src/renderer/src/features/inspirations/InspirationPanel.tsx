import { Archive, CornerDownLeft, Tags, Pencil, Plus, X, RotateCcw, Trash2 } from 'lucide-react'
import { ComposerToggle, InlineComposer, handleComposerKeyDown } from '../shared/InlineComposer'
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover'
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { Ref } from 'react'
import type { Inspiration, InspirationTopic } from '../../../../shared/contracts'
import { getDesktopApi, unwrap } from '../../platform/desktop'
import { useInspirationInput } from './useInspirationInput'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { ClearableTextarea } from '../../components/ui/clearable-textarea'
import { ClearableInput } from '../../components/ui/clearable-input'
import { useDeleteConfirmation } from '../../components/DeleteConfirmation'

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
  const SubmitButton = workbench ? Button : 'button'
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
  useEffect(() => {
    if (!notice || notice.error) return
    const timer = window.setTimeout(() => setNotice(null), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])
  const [ideas, setIdeas] = useState<Inspiration[]>([])
  const [view, setView] = useState<'date' | 'topic'>('topic')
  const [topics, setTopics] = useState<InspirationTopic[]>([])
  const [picker, setPicker] = useState<string | null>(null)
  const [newTopic, setNewTopic] = useState('')
  const [creatingTopic, setCreatingTopic] = useState(false)
  const [topicName, setTopicName] = useState('')
  const [topicSearch, setTopicSearch] = useState('')
  const pendingTopics = useRef(0)
  const topicQueue = useRef<Promise<void>>(Promise.resolve())
  const refreshCurrent = useRef<() => Promise<void>>(async () => {})
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [hasMore, setHasMore] = useState(false)
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
  const [editingHeight, setEditingHeight] = useState(0)
  const originalField = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const field = originalField.current
    if (!field || !editing) return
    field.focus({ preventScroll: true })
    field.setSelectionRange(field.value.length, field.value.length)
    field.scrollTop = field.scrollHeight
  }, [editing, editingGroup])
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
        const items: Inspiration[] = []
        let hasMore = true
        while (items.length < loadedCount.current && hasMore) {
          const result = unwrap(
            await getDesktopApi().listInspirationPage(
              items.length,
              Math.min(100, loadedCount.current - items.length),
              groupQuery()
            )
          )
          items.push(...result.items)
          hasMore = result.hasMore
        }
        if (version.current === request) {
          pendingScroll.current = scrollPositions.current[view]
          setIdeas(items)
          setTopics(topicList)
          setHasMore(hasMore)
        }
      } else {
        const result = unwrap(await getDesktopApi().listInspirations())
        if (version.current === request) setIdeas(result)
      }
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '读取灵感失败。')
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
      notifyError(error instanceof Error ? error.message : '读取灵感失败。')
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
    () => notifySuccess('灵感已保存')
  )
  const original = useInspirationInput(
    async (text, id) => {
      if (!id) throw new Error('灵感不存在。')
      const result = unwrap(await getDesktopApi().updateInspiration(id, text))
      if (workbench) notifySuccess('灵感已保存')
      return result
    },
    refresh,
    notifyError,
    () => setEditing(null)
  )
  const save = async () => (await Promise.all([original.save(), newIdea.save()])).every(Boolean)
  const queueTopicChange = (action: () => Promise<void>) => {
    ++pendingTopics.current
    ++version.current
    topicQueue.current = topicQueue.current.then(async () => {
      try {
        if (!(await save())) return
        await action()
      } catch (error) {
        notifyError(error instanceof Error ? error.message : '归集失败。')
      } finally {
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
            label: '未归类',
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
            label: '历史灵感',
            items: ideas
          },
          { key: 'archive', label: '已归档灵感', items: ideas }
        ]
    : [{ key: 'all', label: '', items: ideas }]
  return (
    <section
      className={`inspiration-panel ${workbench ? 'inspiration-workbench' : ''}`}
      aria-label="灵感"
    >
      {workbench && notice && (
        <div
          className={`inspiration-notice ${notice.error ? 'is-error' : ''}`}
          role={notice.error ? 'alert' : 'status'}
        >
          {notice.message}
          {notice.error && (
            <button aria-label="关闭提示" onClick={() => setNotice(null)}>
              ×
            </button>
          )}
        </div>
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
          <span>{expanded ? '⌄' : '›'} 灵感</span>
          <span data-testid="inspiration-count">{ideas.length}</span>
        </button>
      )}
      {workbench && (
        <aside className="inspiration-navigation">
          <div className="inspiration-views" role="group" aria-label="灵感视角">
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
          {view === 'topic' && (
            <div className="inspiration-topic-create">
              {creatingTopic ? (
                <form
                  className="inspiration-topic-form"
                  onSubmit={async (event) => {
                    event.preventDefault()
                    if (!(await save())) return
                    try {
                      const topic = unwrap(await getDesktopApi().createInspirationTopic(topicName))
                      setCreatingTopic(false)
                      setTopicName('')
                      ++version.current
                      setPicker(null)
                      setIdeas([])
                      setTopicGroup(topic.id)
                      notifySuccess('主题已创建')
                      void refresh()
                    } catch (error) {
                      notifyError(error instanceof Error ? error.message : '创建主题失败。')
                    }
                  }}
                >
                  <ClearableInput
                    aria-label="新增主题名称"
                    placeholder="主题名称"
                    value={topicName}
                    onClear={() => setTopicName('')}
                    onChange={(event) => setTopicName(event.target.value)}
                    autoFocus
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setCreatingTopic(false)
                        setTopicName('')
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
                  onClick={() => setCreatingTopic(true)}
                >
                  <Plus size={14} />
                  <span>新建主题</span>
                </button>
              )}
            </div>
          )}
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
              {view === 'topic' &&
                group.key !== 'unassigned' &&
                (renameId === group.key ? (
                  <form
                    className="inspiration-topic-form"
                    onSubmit={async (event) => {
                      event.preventDefault()
                      try {
                        unwrap(await getDesktopApi().renameInspirationTopic(group.key, renameValue))
                        setRenameId(null)
                        notifySuccess('主题已修改')
                        void refresh()
                      } catch (error) {
                        notifyError(error instanceof Error ? error.message : '修改主题失败。')
                      }
                    }}
                  >
                    <ClearableInput
                      aria-label="主题名称"
                      value={renameValue}
                      onClear={() => setRenameValue('')}
                      onChange={(event) => setRenameValue(event.target.value)}
                      autoFocus
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setRenameId(null)
                      }}
                    />
                    <button
                      type="submit"
                      aria-label="保存主题名称"
                      title="保存"
                      disabled={!renameValue.trim()}
                    >
                      <CornerDownLeft size={15} />
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      aria-label={`重命名${group.label}`}
                      title="重命名"
                      onClick={() => {
                        setRenameId(group.key)
                        setRenameValue(group.label)
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
                              detail: `关联的${topic.count}条灵感及其内容会保留。`
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
                          setRenameId(null)
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
            .map((group) => (
              <div key={group.key} className="inspiration-date-group">
                {workbench && (
                  <>
                    <div className="inspiration-group-header">
                      <h2 className="inspiration-group-title">{group.label}</h2>
                      <span className="inspiration-group-count">
                        {ideas.length}
                        {hasMore ? '+' : ''}条灵感
                      </span>
                      {(view === 'topic' || groupKey === dates[0]) && (
                        <ComposerToggle
                          label="新增灵感"
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
                        autoFocus
                        tone="inspiration"
                        multiline
                        aria-label="新增灵感内容"
                        placeholder="记下一个想法…"
                        value={newIdea.value}
                        onValueChange={newIdea.setValue}
                        onClear={() => newIdea.setValue('')}
                        onSubmit={newIdea.submit}
                        submitLabel="记录灵感"
                        saving={newIdea.saving}
                        onCompositionStart={() => {
                          newIdea.composing.current = true
                        }}
                        onCompositionEnd={newIdea.endComposition}
                      />
                    )}
                  </>
                )}
                {group.items.length === 0 && (
                  <p className="inspiration-empty">
                    {workbench ? '还没有灵感。' : '在下方切换为灵感，记下新的想法。'}
                  </p>
                )}
                {group.items.map((idea) => (
                  <article key={idea.id} data-inspiration-id={idea.id} className="inspiration-item">
                    {workbench && group.key === 'archive' ? (
                      <div className="inspiration-row">
                        <button className="inspiration-summary">
                          <span>{idea.description}</span>
                        </button>
                        <div className="inspiration-row-actions">
                          <button
                            className="inspiration-supplement"
                            title="恢复灵感"
                            aria-label="恢复灵感"
                            onClick={async () => {
                              try {
                                unwrap(await getDesktopApi().restoreInspiration(idea.id))
                                notifySuccess('灵感已恢复')
                                void refresh()
                              } catch (error) {
                                notifyError(error instanceof Error ? error.message : '恢复失败。')
                              }
                            }}
                          >
                            <RotateCcw size={15} />
                          </button>
                          <button
                            className="inspiration-supplement"
                            title="永久删除灵感"
                            aria-label="永久删除灵感"
                            onClick={async () => {
                              try {
                                if (
                                  !(await deletion.confirm({
                                    title: '永久删除灵感',
                                    description: '永久删除这条灵感？',
                                    detail: '灵感及其补充、主题关联将被永久删除，无法恢复。'
                                  }))
                                )
                                  return
                                if (
                                  !unwrap(await getDesktopApi().deleteArchivedInspiration(idea.id))
                                )
                                  return
                                notifySuccess('灵感已删除')
                                void refresh()
                              } catch (error) {
                                notifyError(error instanceof Error ? error.message : '删除失败。')
                              }
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ) : workbench ? (
                      <div className="inspiration-row">
                        {editing === idea.id && editingGroup === group.key ? (
                          <ClearableTextarea
                            ref={originalField}
                            className="inspiration-inline-edit"
                            style={{ height: editingHeight }}
                            rows={1}
                            aria-label="编辑原始想法"
                            data-testid="inspiration-edit"
                            value={original.value}
                            onClear={() => original.setValue('')}
                            onChange={(event) => original.setValue(event.target.value)}
                            onLeave={() => void original.save()}
                            onCompositionStart={() => {
                              original.composing.current = true
                            }}
                            onCompositionEnd={original.endComposition}
                            onKeyDown={(event) =>
                              handleComposerKeyDown(event, original.setValue, original.submit)
                            }
                          />
                        ) : (
                          <button
                            className="inspiration-summary"
                            data-testid="inspiration-summary"
                            onClick={async (event) => {
                              const height = event.currentTarget.getBoundingClientRect().height
                              if (!(await save())) return
                              setEditingHeight(height)
                              original.start(idea)
                              setEditing(idea.id)
                              setEditingGroup(group.key)
                            }}
                          >
                            <span>{idea.description}</span>
                          </button>
                        )}
                        <div className="inspiration-row-actions">
                          {view === 'topic' && idea.createdAt && (
                            <time dateTime={idea.createdAt}>
                              {dateKey(new Date(idea.createdAt))}
                            </time>
                          )}
                          <div className="inspiration-topic-control">
                            <Popover
                              open={picker === `${group.key}:${idea.id}`}
                              onOpenChange={(open) => {
                                setPicker(open ? `${group.key}:${idea.id}` : null)
                                if (open) {
                                  setNewTopic('')
                                  setTopicSearch('')
                                }
                              }}
                            >
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="inspiration-supplement"
                                  aria-label="归集主题"
                                  title="归集主题"
                                >
                                  <Tags size={15} />
                                </button>
                              </PopoverTrigger>
                              {picker === `${group.key}:${idea.id}` && (
                                <PopoverContent
                                  align="end"
                                  className="inspiration-topic-picker"
                                  aria-label="选择主题"
                                >
                                  <FormInput
                                    aria-label="搜索主题"
                                    placeholder="搜索主题"
                                    value={topicSearch}
                                    onClear={() => setTopicSearch('')}
                                    onChange={(event) => setTopicSearch(event.target.value)}
                                    autoFocus
                                  />
                                  {topics
                                    .filter((topic) =>
                                      topic.name
                                        .toLocaleLowerCase()
                                        .includes(topicSearch.trim().toLocaleLowerCase())
                                    )
                                    .map((topic) => (
                                      <label key={topic.id}>
                                        <input
                                          type="checkbox"
                                          checked={idea.topicIds.includes(topic.id)}
                                          onChange={(event) => {
                                            const checked = event.target.checked
                                            setIdeas((current) =>
                                              current.map((item) =>
                                                item.id !== idea.id
                                                  ? item
                                                  : {
                                                      ...item,
                                                      topicIds: checked
                                                        ? [
                                                            ...item.topicIds.filter(
                                                              (id) => id !== topic.id
                                                            ),
                                                            topic.id
                                                          ]
                                                        : item.topicIds.filter(
                                                            (id) => id !== topic.id
                                                          )
                                                    }
                                              )
                                            )
                                            queueTopicChange(async () => {
                                              unwrap(
                                                await getDesktopApi().setInspirationTopic(
                                                  idea.id,
                                                  topic.id,
                                                  checked
                                                )
                                              )
                                              notifySuccess('主题已更新')
                                            })
                                          }}
                                        />
                                        {topic.name}
                                      </label>
                                    ))}
                                  <form
                                    onSubmit={(event) => {
                                      event.preventDefault()
                                      const name = newTopic
                                      queueTopicChange(async () => {
                                        unwrap(
                                          await getDesktopApi().createInspirationTopic(
                                            name,
                                            idea.id
                                          )
                                        )
                                        setNewTopic('')
                                        notifySuccess('主题已创建')
                                      })
                                    }}
                                  >
                                    <FormInput
                                      aria-label="新主题名称"
                                      value={newTopic}
                                      onClear={() => setNewTopic('')}
                                      onChange={(event) => setNewTopic(event.target.value)}
                                      placeholder="新主题"
                                    />
                                    <SubmitButton type="submit">创建并归集</SubmitButton>
                                  </form>
                                </PopoverContent>
                              )}
                            </Popover>
                          </div>
                          <button
                            className="inspiration-supplement"
                            title="归档灵感"
                            aria-label="归档灵感"
                            onClick={async () => {
                              if (!(await save())) return
                              try {
                                unwrap(await getDesktopApi().archiveInspiration(idea.id))
                                notifySuccess('灵感已归档')
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
    </section>
  )
}

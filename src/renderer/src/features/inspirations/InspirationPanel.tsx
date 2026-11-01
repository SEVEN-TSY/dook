const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Ref } from 'react'
import type { Inspiration, InspirationTopic } from '../../../../shared/contracts'
import { getDesktopApi, unwrap } from '../../platform/desktop'
import { useInspirationInput } from './useInspirationInput'

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
  const [view, setView] = useState<'date' | 'topic'>('date')
  const [topics, setTopics] = useState<InspirationTopic[]>([])
  const [picker, setPicker] = useState<string | null>(null)
  const [newTopic, setNewTopic] = useState('')
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [openedGroup, setOpenedGroup] = useState<string | null>(null)
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [dateGroup, setDateGroup] = useState(() => dateKey(new Date()))
  const [topicGroup, setTopicGroup] = useState('unassigned')
  const groupKey = view === 'date' ? dateGroup : topicGroup
  const scrollPositions = useRef({ date: 0, topic: 0 })
  const loadedByView = useRef({ date: 20, topic: 20 })
  const selectedByView = useRef<{ date: string | null; topic: string | null }>({
    date: null,
    topic: null
  })
  const listRef = useRef<HTMLDivElement>(null)
  const loading = useRef(false)
  const loadedCount = useRef(20)
  const [opened, setOpened] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const version = useRef(0)
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
    const request = ++version.current
    try {
      if (workbench) {
        const topicList = unwrap(await getDesktopApi().listInspirationTopics())
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
          setIdeas(items)
          const selected = selectedByView.current[view]
          if (selected && items.some((item) => item.id === selected)) {
            setOpened(selected)
            setOpenedGroup(groupKey)
          }
          requestAnimationFrame(() => {
            if (listRef.current) listRef.current.scrollTop = scrollPositions.current[view]
          })
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
  useEffect(() => {
    if (!workbench || !hasMore) return
    const onScroll = (event: Event) => {
      const target = event.target === document ? document.scrollingElement : event.target
      if (
        target instanceof Element &&
        target.scrollTop + target.clientHeight >= target.scrollHeight - 80
      )
        void loadMore()
    }
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [workbench, hasMore, ideas])
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
  const addition = useInspirationInput(
    async (text, _id, key) => {
      if (!opened) throw new Error('请先展开一条灵感。')
      const idea = unwrap(await getDesktopApi().appendInspiration(opened, text, key))
      if (workbench) notifySuccess('补充已保存')
      return { id: key, description: idea.additions.find((item) => item.id === key)!.content }
    },
    refresh,
    notifyError
  )
  const save = async () => (await Promise.all([original.save(), addition.save()])).every(Boolean)
  useImperativeHandle(ref, () => ({ save }))
  useEffect(() => {
    void refresh()
    const unsubscribe = getDesktopApi().onTasksChanged(() => void refresh())
    return () => {
      ++version.current
      unsubscribe()
    }
  }, [view, groupKey])
  useEffect(() => {
    onEditingChange(editing !== null || (focused && Boolean(addition.value.trim())))
  }, [editing, focused, addition.value, onEditingChange])
  const toggleIdea = async (id: string, group?: string) => {
    if (!(await save())) return
    const close = opened === id && openedGroup === (group ?? null)
    selectedByView.current[view] = close ? null : id
    setOpened(close ? null : id)
    setOpenedGroup(close ? null : (group ?? null))
  }
  const groups = workbench
    ? view === 'topic'
      ? [
          ...topics.map((topic) => ({
            key: topic.id,
            label: topic.name,
            items: ideas
          })),
          {
            key: 'unassigned',
            label: '未归主题',
            items: ideas
          }
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
          }
        ]
    : [{ key: 'all', label: '', items: ideas }]
  return (
    <section
      className={`inspiration-panel ${workbench ? 'inspiration-workbench' : ''} ${opened ? 'has-detail' : ''}`}
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
            {(['date', 'topic'] as const).map((option) => (
              <button
                key={option}
                aria-pressed={view === option}
                onClick={async () => {
                  if (option === view || !(await save())) return
                  scrollPositions.current[view] = listRef.current?.scrollTop ?? 0
                  loadedByView.current[view] = loadedCount.current
                  selectedByView.current[view] = opened
                  ++version.current
                  setIdeas([])
                  loadedCount.current = loadedByView.current[option]
                  setOpened(null)
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
                aria-current={group.key === groupKey ? 'true' : undefined}
                onClick={async () => {
                  if (group.key === groupKey || !(await save())) return
                  ++version.current
                  setIdeas([])
                  loadedCount.current = 20
                  loadedByView.current[view] = 20
                  setOpened(null)
                  selectedByView.current[view] = null
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
                    <input
                      aria-label="主题名称"
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                    />
                    <button type="submit">保存</button>
                    <button type="button" onClick={() => setRenameId(null)}>
                      取消
                    </button>
                  </form>
                ) : (
                  <button
                    aria-label={`重命名${group.label}`}
                    title="重命名"
                    onClick={() => {
                      setRenameId(group.key)
                      setRenameValue(group.label)
                    }}
                  >
                    ✎
                  </button>
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
            scrollPositions.current[view] = target.scrollTop
            if (target.scrollTop + target.clientHeight >= target.scrollHeight - 80) void loadMore()
          }}
          onWheel={(event) => {
            const scroller = document.scrollingElement
            if (
              workbench &&
              event.deltaY > 0 &&
              scroller &&
              scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 80
            )
              void loadMore()
          }}
        >
          {ideas.length === 0 && (
            <p className="inspiration-empty">
              {workbench
                ? '还没有灵感，点击“新增灵感”记录想法。'
                : '在下方切换为灵感，记下新的想法。'}
            </p>
          )}
          {groups
            .filter((group) => !workbench || group.key === groupKey)
            .map((group) => (
              <div key={group.key} className="inspiration-date-group">
                {workbench && <h2 className="inspiration-group-title">{group.label}</h2>}
                {group.items.map((idea) => (
                  <article key={idea.id} data-inspiration-id={idea.id} className="inspiration-item">
                    {workbench ? (
                      <div className="inspiration-row">
                        {editing === idea.id && editingGroup === group.key ? (
                          <textarea
                            className="inspiration-inline-edit"
                            aria-label="编辑原始想法"
                            data-testid="inspiration-edit"
                            autoFocus
                            value={original.value}
                            onChange={(event) => original.setValue(event.target.value)}
                            onBlur={() => void original.save()}
                            onCompositionStart={() => {
                              original.composing.current = true
                            }}
                            onCompositionEnd={original.endComposition}
                          />
                        ) : (
                          <button
                            className="inspiration-summary"
                            data-testid="inspiration-summary"
                            onClick={async () => {
                              if (!(await save())) return
                              original.start(idea)
                              setEditing(idea.id)
                              setEditingGroup(group.key)
                            }}
                          >
                            <span>{idea.description}</span>
                          </button>
                        )}
                        {view === 'topic' && idea.createdAt && (
                          <time dateTime={idea.createdAt}>{dateKey(new Date(idea.createdAt))}</time>
                        )}
                        <div className="inspiration-topic-control">
                          <button
                            aria-label="归集主题"
                            aria-expanded={picker === `${group.key}:${idea.id}`}
                            onClick={() => {
                              setPicker(
                                picker === `${group.key}:${idea.id}`
                                  ? null
                                  : `${group.key}:${idea.id}`
                              )
                              setNewTopic('')
                            }}
                          >
                            ⊞ 归主题
                          </button>
                          {picker === `${group.key}:${idea.id}` && (
                            <div className="inspiration-topic-picker">
                              {topics.map((topic) => (
                                <label key={topic.id}>
                                  <input
                                    type="checkbox"
                                    checked={idea.topicIds.includes(topic.id)}
                                    onChange={async (event) => {
                                      const checked = event.target.checked
                                      if (!(await save())) return
                                      try {
                                        unwrap(
                                          await getDesktopApi().setInspirationTopic(
                                            idea.id,
                                            topic.id,
                                            checked
                                          )
                                        )
                                        notifySuccess('主题已更新')
                                        void refresh()
                                      } catch (error) {
                                        notifyError(
                                          error instanceof Error ? error.message : '归集失败。'
                                        )
                                      }
                                    }}
                                  />
                                  {topic.name}
                                </label>
                              ))}
                              <form
                                onSubmit={async (event) => {
                                  event.preventDefault()
                                  if (!(await save())) return
                                  try {
                                    unwrap(
                                      await getDesktopApi().createInspirationTopic(
                                        newTopic,
                                        idea.id
                                      )
                                    )
                                    setNewTopic('')
                                    notifySuccess('主题已创建')
                                    void refresh()
                                  } catch (error) {
                                    notifyError(
                                      error instanceof Error ? error.message : '创建主题失败。'
                                    )
                                  }
                                }}
                              >
                                <input
                                  aria-label="新主题名称"
                                  value={newTopic}
                                  onChange={(event) => setNewTopic(event.target.value)}
                                  placeholder="新主题"
                                />
                                <button type="submit">创建并归集</button>
                              </form>
                            </div>
                          )}
                        </div>
                        <button
                          aria-label="补充灵感"
                          title="补充灵感"
                          className="inspiration-supplement"
                          data-testid="inspiration-supplement"
                          aria-expanded={opened === idea.id}
                          onClick={() => void toggleIdea(idea.id, group.key)}
                        >
                          ✎
                        </button>
                      </div>
                    ) : (
                      <button
                        className="inspiration-summary"
                        data-testid="inspiration-summary"
                        aria-expanded={opened === idea.id}
                        onClick={() => void toggleIdea(idea.id)}
                      >
                        {idea.description}
                      </button>
                    )}
                    {opened === idea.id && (!workbench || openedGroup === group.key) && (
                      <div className="inspiration-detail">
                        {workbench && (
                          <button
                            className="detail-back"
                            onClick={() => void toggleIdea(idea.id, group.key)}
                          >
                            ← 返回列表
                          </button>
                        )}
                        {workbench && (
                          <>
                            <h2>灵感详情</h2>
                            <p className="inspiration-original">{idea.description}</p>
                          </>
                        )}
                        {!workbench &&
                          (editing === idea.id ? (
                            <input
                              aria-label="编辑原始想法"
                              data-testid="inspiration-edit"
                              autoFocus
                              value={original.value}
                              onChange={(event) => original.setValue(event.target.value)}
                              onBlur={() => void original.save()}
                              onCompositionStart={() => {
                                original.composing.current = true
                              }}
                              onCompositionEnd={original.endComposition}
                              onKeyDown={(event) => {
                                if (
                                  event.key === 'Enter' &&
                                  !event.nativeEvent.isComposing &&
                                  event.keyCode !== 229
                                ) {
                                  event.preventDefault()
                                  void original.submit()
                                }
                              }}
                            />
                          ) : (
                            <button
                              className="inspiration-edit-button"
                              data-testid="inspiration-edit-original"
                              onClick={() => {
                                original.start(idea)
                                setEditing(idea.id)
                              }}
                            >
                              编辑原始想法
                            </button>
                          ))}
                        <ol className="inspiration-additions">
                          {idea.additions.map((item) => (
                            <li key={item.id}>{item.content}</li>
                          ))}
                        </ol>
                        <form
                          onSubmit={(event) => {
                            event.preventDefault()
                            void addition.submit()
                          }}
                        >
                          <textarea
                            aria-label="补充灵感"
                            data-testid="inspiration-addition"
                            placeholder="补充需求、细节或新的想法"
                            value={addition.value}
                            rows={2}
                            onChange={(event) => addition.setValue(event.target.value)}
                            onFocus={() => setFocused(true)}
                            onBlur={() => {
                              setFocused(false)
                              void addition.save()
                            }}
                            onCompositionStart={() => {
                              addition.composing.current = true
                            }}
                            onCompositionEnd={addition.endComposition}
                            onKeyDown={(event) => {
                              if (
                                event.key === 'Enter' &&
                                !event.shiftKey &&
                                !event.nativeEvent.isComposing &&
                                event.keyCode !== 229
                              ) {
                                event.preventDefault()
                                void addition.submit()
                              }
                            }}
                          />
                          <button className="inspiration-append-button" type="submit">
                            追加补充
                          </button>
                        </form>
                      </div>
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

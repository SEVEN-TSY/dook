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
  const [groupsOpen, setGroupsOpen] = useState<Record<string, boolean>>({})
  const loading = useRef(false)
  const loadedCount = useRef(20)
  const [opened, setOpened] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const version = useRef(0)
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
              Math.min(100, loadedCount.current - items.length)
            )
          )
          items.push(...result.items)
          hasMore = result.hasMore
        }
        if (version.current === request) {
          setIdeas(items)
          setTopics(topicList)
          setHasMore(hasMore)
        }
      } else {
        const result = unwrap(await getDesktopApi().listInspirations())
        if (version.current === request) setIdeas(result)
      }
    } catch (error) {
      report(error instanceof Error ? error.message : '读取灵感失败。')
    }
  }
  const loadMore = async () => {
    if (loading.current || !hasMore) return
    loading.current = true
    const request = version.current
    try {
      const result = unwrap(await getDesktopApi().listInspirationPage(ideas.length, 20))
      if (version.current === request) {
        setIdeas((current) => [...current, ...result.items])
        loadedCount.current = ideas.length + result.items.length
        setHasMore(result.hasMore)
      }
    } catch (error) {
      report(error instanceof Error ? error.message : '读取灵感失败。')
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
      return unwrap(await getDesktopApi().updateInspiration(id, text))
    },
    refresh,
    report,
    () => setEditing(null)
  )
  const addition = useInspirationInput(
    async (text, _id, key) => {
      if (!opened) throw new Error('请先展开一条灵感。')
      const idea = unwrap(await getDesktopApi().appendInspiration(opened, text, key))
      return { id: key, description: idea.additions.find((item) => item.id === key)!.content }
    },
    refresh,
    report
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
  }, [])
  useEffect(() => {
    onEditingChange(editing !== null || (focused && Boolean(addition.value.trim())))
  }, [editing, focused, addition.value, onEditingChange])
  const toggleIdea = async (id: string, group?: string) => {
    if (!(await save())) return
    const close = opened === id && openedGroup === (group ?? null)
    setOpened(close ? null : id)
    setOpenedGroup(close ? null : (group ?? null))
  }
  const dateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setHours(12, 0, 0, 0)
    date.setDate(date.getDate() - index)
    return dateKey(date)
  })
  const groups = workbench
    ? view === 'topic'
      ? [
          ...topics.map((topic) => ({
            key: topic.id,
            label: topic.name,
            items: ideas.filter((idea) => idea.topicIds.includes(topic.id))
          })),
          {
            key: 'unassigned',
            label: '未归主题',
            items: ideas.filter((idea) => idea.topicIds.length === 0)
          }
        ]
      : [
          ...dates.map((date, index) => ({
            key: date,
            label: index === 0 ? '今天' : date,
            items: ideas.filter(
              (idea) => idea.createdAt && dateKey(new Date(idea.createdAt)) === date
            )
          })),
          {
            key: 'history',
            label: '历史灵感',
            items: ideas.filter(
              (idea) => !idea.createdAt || !dates.includes(dateKey(new Date(idea.createdAt)))
            )
          }
        ]
    : [{ key: 'all', label: '', items: ideas }]
  return (
    <section
      className={`inspiration-panel ${workbench ? 'inspiration-workbench' : ''} ${opened ? 'has-detail' : ''}`}
      aria-label="灵感"
    >
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
        <div className="inspiration-views" role="group" aria-label="灵感视角">
          {(['date', 'topic'] as const).map((option) => (
            <button
              key={option}
              aria-pressed={view === option}
              onClick={async () => {
                if (!(await save())) return
                ++version.current
                loadedCount.current = 20
                setGroupsOpen({})
                setOpened(null)
                setPicker(null)
                setView(option)
                void refresh()
              }}
            >
              {option === 'date' ? '日期' : '主题'}
            </button>
          ))}
        </div>
      )}
      {(expanded || (workbench && !collapsible)) && (
        <div
          className="inspiration-list"
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
          {groups.map((group, index) => (
            <div key={group.key} className="inspiration-date-group">
              {workbench && (
                <button
                  className="inspiration-heading"
                  aria-expanded={groupsOpen[group.key] ?? (view === 'date' && index === 0)}
                  onClick={async () => {
                    if (!(await save())) return
                    setGroupsOpen((current) => ({
                      ...current,
                      [group.key]: !(current[group.key] ?? (view === 'date' && index === 0))
                    }))
                  }}
                >
                  <span>
                    {(groupsOpen[group.key] ?? (view === 'date' && index === 0)) ? '⌄' : '›'}{' '}
                    {group.label}
                  </span>
                </button>
              )}
              {workbench &&
                view === 'topic' &&
                group.key !== 'unassigned' &&
                (renameId === group.key ? (
                  <form
                    onSubmit={async (event) => {
                      event.preventDefault()
                      try {
                        unwrap(await getDesktopApi().renameInspirationTopic(group.key, renameValue))
                        setRenameId(null)
                        void refresh()
                      } catch (error) {
                        report(error instanceof Error ? error.message : '修改主题失败。')
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
                    onClick={() => {
                      setRenameId(group.key)
                      setRenameValue(group.label)
                    }}
                  >
                    重命名
                  </button>
                ))}
              {(!workbench || (groupsOpen[group.key] ?? (view === 'date' && index === 0))) &&
                group.items.map((idea) => (
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
                            主题
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
                                        void refresh()
                                      } catch (error) {
                                        report(
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
                                    void refresh()
                                  } catch (error) {
                                    report(
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
                          className="inspiration-supplement"
                          data-testid="inspiration-supplement"
                          aria-expanded={opened === idea.id}
                          onClick={() => void toggleIdea(idea.id, group.key)}
                        >
                          补充
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

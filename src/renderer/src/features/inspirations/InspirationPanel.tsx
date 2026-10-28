import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Ref } from 'react'
import type { Inspiration } from '../../../../shared/contracts'
import { getDesktopApi, unwrap } from '../../platform/desktop'
import { useInspirationInput } from './useInspirationInput'

export interface InspirationPanelHandle {
  save: () => Promise<boolean>
}

export function InspirationPanel({
  ref,
  report,
  onEditingChange,
  workbench = false
}: {
  ref: Ref<InspirationPanelHandle>
  report: (message: string) => void
  onEditingChange: (active: boolean) => void
  workbench?: boolean
}) {
  const [ideas, setIdeas] = useState<Inspiration[]>([])
  const [expanded, setExpanded] = useState(false)
  const [opened, setOpened] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const version = useRef(0)
  const refresh = async () => {
    const request = ++version.current
    try {
      const result = unwrap(await getDesktopApi().listInspirations())
      if (version.current === request) setIdeas(result)
    } catch (error) {
      report(error instanceof Error ? error.message : '读取灵感失败。')
    }
  }
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
  const toggleIdea = async (id: string) => {
    if (!(await save())) return
    setOpened(opened === id ? null : id)
  }
  return (
    <section
      className={`inspiration-panel ${workbench ? 'inspiration-workbench' : ''} ${opened ? 'has-detail' : ''}`}
      aria-label="灵感"
    >
      {!workbench && (
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
      {(expanded || workbench) && (
        <div className="inspiration-list">
          {ideas.length === 0 && (
            <p className="inspiration-empty">
              {workbench
                ? '还没有灵感，点击“新增灵感”记录想法。'
                : '在下方切换为灵感，记下新的想法。'}
            </p>
          )}
          {ideas.map((idea) => (
            <article key={idea.id} data-inspiration-id={idea.id} className="inspiration-item">
              <button
                className="inspiration-summary"
                data-testid="inspiration-summary"
                aria-expanded={opened === idea.id}
                onClick={() => void toggleIdea(idea.id)}
              >
                {idea.description}
              </button>
              {opened === idea.id && (
                <div className="inspiration-detail">
                  {workbench && (
                    <button className="detail-back" onClick={() => void toggleIdea(idea.id)}>
                      ← 返回列表
                    </button>
                  )}
                  {workbench && (
                    <>
                      <h2>灵感详情</h2>
                      <p className="inspiration-original">{idea.description}</p>
                    </>
                  )}
                  {editing === idea.id ? (
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
                  )}
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
      )}
    </section>
  )
}

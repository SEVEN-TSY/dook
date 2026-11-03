import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Inspiration } from '../../../../shared/contracts'
import { TaskActionIcon } from '../../components/AppIcon'

/** 两个列表始终挂载，横向投影不会丢失各自的滚动位置。 */
export function NotePages({
  selected,
  ideas,
  archivedIdeas,
  onArchive,
  onRestore,
  onDelete,
  renderDescription,
  children
}: {
  selected: 'task' | 'inspiration'
  ideas: Inspiration[]
  archivedIdeas: Inspiration[]
  onArchive: (id: string) => Promise<void>
  onRestore: (id: string) => Promise<void>
  onDelete: (idea: Inspiration) => Promise<void>
  renderDescription: (idea: Inspiration) => ReactNode
  children: ReactNode
}) {
  const pending = useRef(false)
  const [archiving, setArchiving] = useState(false)
  const [archiveExpanded, setArchiveExpanded] = useState(false)
  const act = async (action: () => Promise<void>) => {
    if (pending.current) return
    pending.current = true
    setArchiving(true)
    try {
      await action()
    } finally {
      pending.current = false
      setArchiving(false)
    }
  }
  return (
    <div className="note-pages">
      <div
        className="note-pages-track"
        style={{ transform: selected === 'task' ? 'translateX(0)' : 'translateX(-50%)' }}
      >
        <div
          className="note-pane"
          data-note-page="task"
          inert={selected !== 'task'}
          aria-hidden={selected !== 'task'}
        >
          {children}
        </div>
        <div
          className="note-pane"
          data-note-page="inspiration"
          inert={selected !== 'inspiration'}
          aria-hidden={selected !== 'inspiration'}
        >
          <div
            className="note-jottings-list"
            role="region"
            aria-label="今天的小记"
            tabIndex={-1}
            data-delete-focus-fallback={selected === 'inspiration' ? true : undefined}
          >
            {ideas.length === 0 && (
              <div className="task-empty">
                <p>随手记下一点想法或小事。</p>
              </div>
            )}
            {ideas.map((idea) => (
              <div key={idea.id} className="task-row" data-note-jotting-id={idea.id}>
                <span className="note-jotting-marker" aria-hidden="true" />
                <div className="task-content">{renderDescription(idea)}</div>
                <div className="note-task-actions">
                  <button
                    type="button"
                    className="task-delete"
                    title="归档小记"
                    aria-label={`归档小记：${idea.description}`}
                    disabled={archiving}
                    onClick={() => void act(() => onArchive(idea.id))}
                  >
                    <TaskActionIcon name="delete" />
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="note-group-heading"
              data-testid="jotting-archive-toggle"
              hidden={ideas.length === 0 && archivedIdeas.length === 0}
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
              已归档<span className="note-group-count">{archivedIdeas.length}</span>
            </button>
            <div hidden={!archiveExpanded} aria-label="已归档小记">
              {archivedIdeas.map((idea) => (
                <div className="note-archive-row" key={idea.id} data-archived-jotting-id={idea.id}>
                  <span className="note-jotting-marker" aria-hidden="true" />
                  <span className="note-archive-description" title={idea.description}>
                    {idea.description}
                  </span>
                  <div className="note-archive-actions" tabIndex={-1} data-delete-focus-group>
                    <button
                      type="button"
                      className="task-delete note-archive-delete"
                      title="永久删除小记"
                      aria-label={`永久删除小记：${idea.description}`}
                      disabled={archiving}
                      onClick={() => void onDelete(idea)}
                    >
                      <TaskActionIcon name="delete" />
                    </button>
                    <button
                      type="button"
                      className="task-pin"
                      title="恢复小记"
                      aria-label={`恢复小记：${idea.description}`}
                      disabled={archiving}
                      onClick={() => void act(() => onRestore(idea.id))}
                    >
                      <TaskActionIcon name="restore" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

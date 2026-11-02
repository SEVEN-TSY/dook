import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Inspiration } from '../../../../shared/contracts'
import { TaskActionIcon } from '../../components/AppIcon'

/** 两个列表始终挂载，横向投影不会丢失各自的滚动位置。 */
export function NotePages({
  selected,
  ideas,
  onArchive,
  children
}: {
  selected: 'task' | 'inspiration'
  ideas: Inspiration[]
  onArchive: (id: string) => Promise<void>
  children: ReactNode
}) {
  const pending = useRef(false)
  const [archiving, setArchiving] = useState(false)
  const archive = async (id: string) => {
    if (pending.current) return
    pending.current = true
    setArchiving(true)
    try {
      await onArchive(id)
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
          <div className="note-jottings-list" role="region" aria-label="今天的小记">
            {ideas.length === 0 && (
              <div className="task-empty">
                <p>随手记下一点想法或小事。</p>
              </div>
            )}
            {ideas.map((idea) => (
              <div key={idea.id} className="task-row" data-note-jotting-id={idea.id}>
                <span className="task-description" title={idea.description}>
                  {idea.description}
                </span>
                <div className="note-task-actions">
                  <button
                    type="button"
                    className="task-delete"
                    title="归档小记"
                    aria-label={`归档小记：${idea.description}`}
                    disabled={archiving}
                    onClick={() => void archive(idea.id)}
                  >
                    <TaskActionIcon name="delete" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

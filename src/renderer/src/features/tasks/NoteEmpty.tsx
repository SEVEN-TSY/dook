import { Plus } from 'lucide-react'
import dookWordmark from '../../../../../resources/dook-wordmark-v2-straight.svg'

export function NoteEmpty({ kind, onAdd }: { kind: 'task' | 'inspiration'; onAdd: () => void }) {
  const jotting = kind === 'inspiration'
  return (
    <div className="note-empty" data-note-empty={kind}>
      <span className="note-empty-icon" aria-hidden="true">
        <span className="note-empty-wordmark" style={{ maskImage: `url("${dookWordmark}")` }} />
      </span>
      <p>{jotting ? '把此刻的想法，留在这里。' : '把今天的计划，留在这里。'}</p>
      <small>{jotting ? '一个念头、一件小事，随手记下。' : '做好每一个任务，让今天OK。'}</small>
      <button type="button" className="note-empty-add" onClick={onAdd}>
        <Plus size={14} aria-hidden="true" />
        {jotting ? '添加一条小记' : '添加今天的任务'}
      </button>
    </div>
  )
}

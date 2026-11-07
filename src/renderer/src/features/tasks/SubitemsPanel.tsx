import { GripVertical } from 'lucide-react'
import { ReadonlyDescription } from '../shared/ReadonlyDescription'
import { handleComposerKeyDown, InlineComposer } from '../shared/InlineComposer'
import { toast } from 'sonner'
import { TaskCheck } from '../../components/TaskCheck'
import { ClearableTextarea } from '../../components/ui/clearable-textarea'
import { useEffect, useRef, useState } from 'react'
import type { Subitem, Task } from '../../../../shared/contracts'
import { getDesktopApi, unwrap } from '../../platform/desktop'
import { useSerialSave } from '../shared/useSerialSave'

interface Props {
  composerRevision?: number
  task: Task
  changed: () => Promise<void>
  report: (message: string) => void
  onSaveReady: (id: string, save: () => Promise<boolean>) => () => void
  onInteraction: (id: string, active: boolean) => void
}
interface Draft {
  id?: string
  text: string
  saved: string
  observed?: boolean
}

function focusSubitemEditor(field: HTMLTextAreaElement | null) {
  if (!field) return
  field.focus({ preventScroll: true })
  field.setSelectionRange(field.value.length, field.value.length)
}

export function SubitemsPanel({
  composerRevision,
  task,
  changed,
  report,
  onSaveReady,
  onInteraction
}: Props) {
  const composerInput = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (composerRevision === undefined) return
    requestAnimationFrame(() => composerInput.current?.focus({ preventScroll: true }))
  }, [composerRevision])
  const [draft, setDraft] = useState<Draft>({ text: '', saved: '' })
  const current = useRef(draft)
  const [mutating, setMutating] = useState(false)
  const [dragged, setDragged] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; before: boolean } | null>(null)
  const [focused, setFocused] = useState(false)
  const save = useRef(async () => true)
  const reset = () => {
    current.current = { text: '', saved: '' }
    setDraft(current.current)
  }
  const {
    save: saveDraft,
    saving,
    composing,
    endComposition,
    resetComposition
  } = useSerialSave(
    current,
    async (session) => {
      const text = session.text.trim()
      if (!text) {
        if (session.id || session.text.length > 0) {
          report('子事项内容不能为空。')
          return 'blocked'
        }
        return 'done'
      }
      if (text === session.saved) {
        reset()
        return 'done'
      }
      const api = getDesktopApi()
      const updated = unwrap(
        await (session.id
          ? api.updateSubitem(task.id, session.id, text)
          : api.addSubitem(task.id, text))
      )
      const item = session.id
        ? updated.subitems?.find((item) => item.id === session.id)
        : updated.subitems?.at(-1)
      if (!item) throw new Error('子事项已失效，请重试。')
      toast.success(session.id ? '子事项已保存' : '子事项已添加')
      session.id = item.id
      session.saved = item.description
      report('')
      await changed()
      return 'continue'
    },
    report,
    '子事项保存失败，请重试。'
  )
  const [newText, setNewText] = useState('')
  const newDraft = useRef<Draft>({ text: '', saved: '' })
  const newInput = useSerialSave(
    newDraft,
    async (session) => {
      const text = session.text.trim()
      if (!text) {
        if (session.text.length > 0) {
          report('子事项内容不能为空。')
          return 'blocked'
        }
        return 'done'
      }
      if (text === session.saved) {
        newDraft.current = { text: '', saved: '' }
        setNewText('')
        return 'done'
      }
      const api = getDesktopApi()
      const updated = unwrap(
        await (session.id
          ? api.updateSubitem(task.id, session.id, text)
          : api.addSubitem(task.id, text))
      )
      const item = session.id
        ? updated.subitems?.find((item) => item.id === session.id)
        : updated.subitems?.at(-1)
      if (!item) throw new Error('子事项已失效，请重试。')
      session.id = item.id
      session.saved = item.description
      toast.success('子事项已添加')
      report('')
      await changed()
      return 'continue'
    },
    report,
    '子事项保存失败，请重试。'
  )
  const changeNewText = (text: string) => {
    newDraft.current.text = text
    setNewText(text)
  }
  save.current = () => {
    if (composing.current || newInput.composing.current) report('请先完成输入法选字，再切换任务。')
    return Promise.all([saveDraft(), newInput.save()]).then((results) => results.every(Boolean))
  }
  const busy = saving || newInput.saving || mutating
  useEffect(() => {
    const session = current.current
    if (!session.id) return
    if (task.subitems?.some((item) => item.id === session.id)) {
      session.observed = true
    } else if (session.observed) {
      resetComposition()
      reset()
      report('正在编辑的子事项已删除，编辑已结束。')
    }
  }, [task.subitems])
  useEffect(() => onSaveReady(task.id, () => save.current()), [task.id, onSaveReady])
  useEffect(() => {
    onInteraction(task.id, draft.id !== undefined || (focused && Boolean(newText.trim())))
    return () => onInteraction(task.id, false)
  }, [task.id, draft.id, newText, focused, onInteraction])
  const changeText = (text: string) => {
    current.current.text = text
    setDraft({ ...current.current })
  }
  const beginEdit = async (item: Subitem) => {
    if (!(await save.current())) return
    current.current = {
      id: item.id,
      text: item.description,
      saved: item.description,
      observed: true
    }
    setDraft(current.current)
  }
  const mutate = async (action: () => Promise<unknown>) => {
    if (!(await save.current())) return
    setMutating(true)
    try {
      await action()
      toast.success('子事项操作成功')
      report('')
      await changed()
    } catch (error) {
      report(error instanceof Error ? error.message : '子事项操作失败。')
    } finally {
      setMutating(false)
    }
  }
  const inputProps = {
    value: draft.text,
    onClear: () => changeText(''),
    disabled: busy,
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => changeText(event.target.value),
    onFocus: () => setFocused(true),
    onLeave: () => {
      setFocused(false)
      void save.current()
    },
    onCompositionStart: () => {
      composing.current = true
    },
    onCompositionEnd: endComposition,
    onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) =>
      handleComposerKeyDown(event, changeText, async () => {
        if (!current.current.text.trim()) {
          report('子事项内容不能为空。')
          return
        }
        await save.current()
      })
  }
  const subitems = task.subitems ?? []
  return (
    <section className="subitems-panel">
      <InlineComposer
        ref={composerInput}
        className="subitem-composer"
        value={newText}
        onValueChange={changeNewText}
        onSubmit={() => newInput.save()}
        submitLabel="添加子事项"
        aria-label="新增子事项"
        data-testid="subitem-new"
        placeholder="添加子事项"
        saving={busy}
        onCompositionStart={() => {
          newInput.composing.current = true
        }}
        onCompositionEnd={newInput.endComposition}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          void newInput.save()
        }}
      />
      <div className="subitems-list">
        {subitems.map((item) => (
          <div
            className={`subitem-row ${item.completed ? 'subitem-completed' : ''} ${dragged === item.id ? 'is-dragging' : ''} ${dropTarget?.id === item.id ? (dropTarget.before ? 'subitem-drop-before' : 'subitem-drop-after') : ''}`}
            key={item.id}
            data-subitem-id={item.id}
            draggable={!busy}
            onDragStart={(event) => {
              if (
                (event.target as Element).closest(
                  'input, textarea, button:not(.subitem-drag), .readonly-description'
                )
              ) {
                event.preventDefault()
                return
              }
              event.stopPropagation()
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('application/x-mytodo-subitem', `${task.id}:${item.id}`)
              setDragged(item.id)
            }}
            onDragOver={(event) => {
              if (!dragged || dragged === item.id) return
              event.preventDefault()
              event.stopPropagation()
              const bounds = event.currentTarget.getBoundingClientRect()
              setDropTarget({ id: item.id, before: event.clientY < bounds.top + bounds.height / 2 })
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                setDropTarget(null)
            }}
            onDrop={(event) => {
              event.preventDefault()
              event.stopPropagation()
              const source = dragged
              const target = dropTarget
              setDragged(null)
              setDropTarget(null)
              if (source && target?.id === item.id)
                void mutate(async () =>
                  unwrap(await getDesktopApi().moveSubitem(task.id, source, item.id, target.before))
                )
            }}
            onDragEnd={() => {
              setDragged(null)
              setDropTarget(null)
            }}
          >
            <button
              type="button"
              className="subitem-drag"
              draggable={!busy}
              aria-label={`拖动排序：${item.description}`}
              title="拖动调整顺序"
              disabled={busy}
              onKeyDown={(event) => {
                if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return
                event.preventDefault()
                const index = subitems.findIndex((value) => value.id === item.id)
                const before = event.key === 'ArrowUp'
                const target = subitems[index + (before ? -1 : 1)]
                if (target)
                  void mutate(async () =>
                    unwrap(await getDesktopApi().moveSubitem(task.id, item.id, target.id, before))
                  )
              }}
            >
              <GripVertical size={12} />
            </button>
            <TaskCheck
              checked={item.completed}
              disabled={busy}
              aria-label={`完成子事项：${item.description}`}
              onChange={() =>
                void mutate(async () =>
                  unwrap(
                    await getDesktopApi().setSubitemCompleted(task.id, item.id, !item.completed)
                  )
                )
              }
            />
            {item.completed ? (
              <ReadonlyDescription
                description={item.description}
                className="subitem-description"
                testId="subitem-description"
              />
            ) : draft.id === item.id ? (
              <ClearableTextarea
                className="main-list-editor subitem-editor"
                rows={1}
                ref={focusSubitemEditor}
                data-testid="subitem-edit"
                aria-label="编辑子事项"
                {...inputProps}
              />
            ) : (
              <button
                className="subitem-description"
                title={item.description}
                data-testid="subitem-description"
                disabled={busy}
                onClick={() => void beginEdit(item)}
              >
                {item.description}
              </button>
            )}
            <button
              className="subitem-delete"
              data-testid="subitem-delete"
              aria-label={`删除子事项：${item.description}`}
              disabled={busy}
              onClick={() =>
                void mutate(async () =>
                  unwrap(await getDesktopApi().deleteSubitem(task.id, item.id))
                )
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

import { TaskCheck } from '../../components/TaskCheck'
import { ClearableInput } from '../../components/ui/clearable-input'
import { useEffect, useRef, useState } from 'react'
import type { Subitem, Task } from '../../../../shared/contracts'
import { getDesktopApi, unwrap } from '../../platform/desktop'
import { useSerialSave } from '../shared/useSerialSave'

interface Props {
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

export function SubitemsPanel({ task, changed, report, onSaveReady, onInteraction }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState<Draft>({ text: '', saved: '' })
  const current = useRef(draft)
  const [mutating, setMutating] = useState(false)
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
        if (session.id) {
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
      session.id = item.id
      session.saved = item.description
      report('')
      await changed()
      return 'continue'
    },
    report,
    '子事项保存失败，请重试。'
  )
  save.current = saveDraft
  const busy = saving || mutating
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
    onInteraction(task.id, draft.id !== undefined || (focused && Boolean(draft.text.trim())))
    return () => onInteraction(task.id, false)
  }, [task.id, draft.id, draft.text, focused, onInteraction])
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
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => changeText(event.target.value),
    onFocus: () => setFocused(true),
    onBlur: () => {
      setFocused(false)
      void save.current()
    },
    onCompositionStart: () => {
      composing.current = true
    },
    onCompositionEnd: endComposition,
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      if (event.nativeEvent.isComposing || event.keyCode === 229) return
      if (!current.current.text.trim()) {
        report('子事项内容不能为空。')
        return
      }
      void save.current()
    }
  }
  const subitems = task.subitems ?? []
  return (
    <section className="subitems-panel">
      <button
        className="subitems-toggle"
        data-testid="subitems-toggle"
        aria-expanded={expanded}
        onClick={async () => {
          if (await save.current()) setExpanded(!expanded)
        }}
      >
        {expanded ? '⌄' : '›'}{' '}
        {subitems.length
          ? `子事项 ${subitems.filter((item) => item.completed).length}／${subitems.length}`
          : '添加子事项'}
      </button>
      {expanded && (
        <div className="subitems-list">
          {subitems.map((item) => (
            <div
              className={`subitem-row ${item.completed ? 'subitem-completed' : ''}`}
              key={item.id}
              data-subitem-id={item.id}
            >
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
              {draft.id === item.id ? (
                <ClearableInput
                  data-testid="subitem-edit"
                  aria-label="编辑子事项"
                  autoFocus
                  {...inputProps}
                />
              ) : (
                <button
                  className="subitem-description"
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
          {!draft.id && (
            <ClearableInput
              className="subitem-new"
              data-testid="subitem-new"
              aria-label="新增子事项"
              placeholder="记下一项子事项"
              {...inputProps}
            />
          )}
        </div>
      )}
    </section>
  )
}

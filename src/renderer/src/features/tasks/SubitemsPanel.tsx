import { useEffect, useRef, useState } from 'react'
import type { Subitem, Task } from '../../../../shared/contracts'
import { getDesktopApi, unwrap } from '../../platform/desktop'

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
}

export function SubitemsPanel({ task, changed, report, onSaveReady, onInteraction }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState<Draft>({ text: '', saved: '' })
  const current = useRef(draft)
  const [busy, setBusy] = useState(false)
  const [focused, setFocused] = useState(false)
  const composing = useRef(false)
  const afterComposition = useRef(false)
  const pending = useRef<Promise<boolean> | null>(null)
  const save = useRef(async () => true)
  const reset = () => {
    current.current = { text: '', saved: '' }
    setDraft(current.current)
  }
  save.current = () => {
    if (pending.current) return pending.current
    if (composing.current) {
      afterComposition.current = true
      return Promise.resolve(false)
    }
    const session = current.current
    setBusy(true)
    const run = async () => {
      try {
        while (current.current === session) {
          if (composing.current) {
            afterComposition.current = true
            return false
          }
          const text = session.text.trim()
          if (!text) {
            if (session.id) {
              report('子事项内容不能为空。')
              return false
            }
            return true
          }
          if (text === session.saved) {
            reset()
            return true
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
        }
        return true
      } catch (error) {
        report(error instanceof Error ? error.message : '子事项保存失败，请重试。')
        return false
      }
    }
    pending.current = run().finally(() => {
      pending.current = null
      setBusy(false)
    })
    return pending.current
  }
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
    current.current = { id: item.id, text: item.description, saved: item.description }
    setDraft(current.current)
  }
  const mutate = async (action: () => Promise<unknown>) => {
    if (!(await save.current())) return
    setBusy(true)
    try {
      await action()
      report('')
      await changed()
    } catch (error) {
      report(error instanceof Error ? error.message : '子事项操作失败。')
    } finally {
      setBusy(false)
    }
  }
  const inputProps = {
    value: draft.text,
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
    onCompositionEnd: () => {
      composing.current = false
      if (afterComposition.current) {
        afterComposition.current = false
        void save.current()
      }
    },
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
              <input
                type="checkbox"
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
                <input
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
            <input
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

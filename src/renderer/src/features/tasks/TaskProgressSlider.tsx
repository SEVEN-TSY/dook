import { useEffect, useRef, useState } from 'react'

export function TaskProgressSlider({
  value,
  label,
  disabled,
  onCommit,
  compact = false,
  readOnly = false,
  onBlocked,
  onInteraction,
  progressText
}: {
  value: number
  label: string
  disabled: boolean
  onCommit: (value: number) => Promise<boolean>
  progressText?: string
  compact?: boolean
  readOnly?: boolean
  onBlocked?: () => void
  onInteraction?: (active: boolean) => void
}) {
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const current = useRef(value)
  const saved = useRef(value)
  const pending = useRef(false)
  useEffect(() => {
    if (pending.current) return
    saved.current = value
    current.current = value
    setDraft(value)
  }, [value])
  const commit = async () => {
    if (readOnly || pending.current || current.current === saved.current) return
    pending.current = true
    setSaving(true)
    const next = current.current
    const ok = await onCommit(next)
    if (ok) saved.current = next
    else {
      current.current = saved.current
      setDraft(saved.current)
    }
    pending.current = false
    setSaving(false)
  }
  return (
    <span
      className={compact ? 'task-progress' : 'task-inline-progress'}
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        event.stopPropagation()
        if (readOnly) {
          event.preventDefault()
          onBlocked?.()
        }
      }}
    >
      <span
        className={
          compact ? 'task-note-progress-track' : 'task-mini-progress task-editable-progress'
        }
      >
        {!compact && <span style={{ width: `${draft}%` }} />}
        <input
          type="range"
          min="0"
          max="100"
          step="25"
          aria-label={label}
          data-testid="task-progress"
          aria-readonly={readOnly}
          value={draft}
          disabled={disabled || saving}
          onChange={(event) => {
            if (readOnly) return
            current.current = Math.round(Number(event.target.value) / 25) * 25
            setDraft(current.current)
          }}
          onPointerDown={(event) => {
            if (!readOnly) {
              onInteraction?.(true)
              event.currentTarget.setPointerCapture(event.pointerId)
            }
          }}
          onPointerUp={() => {
            onInteraction?.(false)
            void commit()
          }}
          onPointerCancel={() => {
            onInteraction?.(false)
            void commit()
          }}
          onKeyUp={() => void commit()}
          onFocus={() => onInteraction?.(true)}
          onBlur={() => {
            onInteraction?.(false)
            void commit()
          }}
          onKeyDown={(event) => {
            if (
              readOnly &&
              [
                'ArrowLeft',
                'ArrowRight',
                'ArrowUp',
                'ArrowDown',
                'Home',
                'End',
                'PageUp',
                'PageDown'
              ].includes(event.key)
            ) {
              event.preventDefault()
              onBlocked?.()
            }
          }}
        />
      </span>
      <span>{progressText ?? `${draft}%`}</span>
    </span>
  )
}

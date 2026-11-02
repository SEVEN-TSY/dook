import { CornerDownLeft, Plus, X } from 'lucide-react'
import { useImperativeHandle, useRef } from 'react'
import type { ComponentProps, KeyboardEvent } from 'react'

export function handleComposerKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  setValue: (value: string) => void,
  submit: () => void | Promise<unknown>,
  multiline = true
) {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229) return
  event.preventDefault()
  if (event.ctrlKey && multiline) {
    const field = event.currentTarget
    const caret = field.selectionStart + 1
    setValue(
      `${field.value.slice(0, field.selectionStart)}\n${field.value.slice(field.selectionEnd)}`
    )
    requestAnimationFrame(() => field.setSelectionRange(caret, caret))
  } else {
    void submit()
  }
}

type Props = Omit<ComponentProps<'textarea'>, 'onChange' | 'onSubmit' | 'value'> & {
  value: string
  onValueChange: (value: string) => void
  onSubmit: () => void | Promise<unknown>
  submitLabel: string
  onClear?: () => void
  saving?: boolean
  multiline?: boolean
  tone?: 'task' | 'habit' | 'inspiration'
  expanded?: boolean
}

export function ComposerToggle({
  expanded,
  label,
  onClick,
  className = ''
}: {
  expanded: boolean
  label: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      className={`composer-toggle ${className}`}
      aria-label={label}
      title={expanded ? '收起输入框' : label}
      aria-expanded={expanded}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <Plus size={20} />
    </button>
  )
}

/** Shared writing surface; drafts stay mounted while the entry is collapsed. */
export function InlineComposer({
  ref,
  onClear,
  value,
  onValueChange,
  onSubmit,
  submitLabel,
  saving = false,
  multiline = false,
  tone = 'task',
  expanded = true,
  className = '',
  ...fieldProps
}: Props) {
  const field = useRef<HTMLTextAreaElement>(null)
  useImperativeHandle(ref, () => field.current!, [])
  return (
    <form
      className={`inline-composer composer-${tone} ${className}`}
      hidden={!expanded}
      aria-busy={saving}
      onSubmit={(event) => {
        event.preventDefault()
        if (value.trim()) void onSubmit()
      }}
    >
      <Plus className="composer-icon" size={17} aria-hidden="true" />
      <textarea
        aria-description={multiline ? '回车确认，Ctrl+回车换行' : '回车确认'}
        {...fieldProps}
        ref={field}
        rows={1}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) =>
          handleComposerKeyDown(
            event,
            onValueChange,
            () => {
              if (value.trim()) return onSubmit()
            },
            multiline
          )
        }
      />
      {onClear && value.length > 0 && !fieldProps.disabled && !fieldProps.readOnly && (
        <button
          type="button"
          className="composer-clear"
          aria-label={`清除${fieldProps['aria-label'] ?? '输入内容'}`}
          title="清除"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onClear()
            field.current?.focus({ preventScroll: true })
          }}
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
      <button
        type="submit"
        className="composer-submit"
        aria-label={submitLabel}
        title={submitLabel}
        disabled={!value.trim() || saving}
        onMouseDown={(event) => event.preventDefault()}
      >
        <CornerDownLeft size={18} />
      </button>
    </form>
  )
}

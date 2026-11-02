import { CornerDownLeft, Plus } from 'lucide-react'
import { ClearButton } from '../../components/ui/clear-button'
import { useEffect, useImperativeHandle, useRef } from 'react'
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
  onDismiss?: () => void | Promise<void>
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
  onDismiss,
  className = '',
  ...fieldProps
}: Props) {
  const field = useRef<HTMLTextAreaElement>(null)
  const form = useRef<HTMLFormElement>(null)
  useImperativeHandle(ref, () => field.current!, [])
  useEffect(() => {
    if (!expanded || !onDismiss) return
    const dismiss = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element) || !form.current?.checkVisibility()) return
      if (form.current.contains(target)) return
      if (
        target.closest(
          'button, a, input, textarea, select, label, [role="dialog"], [role="menu"], [contenteditable="true"]'
        )
      )
        return
      void onDismiss()
    }
    document.addEventListener('click', dismiss)
    return () => document.removeEventListener('click', dismiss)
  }, [expanded, onDismiss])
  return (
    <form
      ref={form}
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
      {value.length > 0 && !fieldProps.disabled && !fieldProps.readOnly && (
        <ClearButton
          className="composer-clear"
          label={fieldProps['aria-label'] ?? '输入内容'}
          onClear={onClear ?? (() => onValueChange(''))}
          focusField={() => field.current?.focus({ preventScroll: true })}
        />
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

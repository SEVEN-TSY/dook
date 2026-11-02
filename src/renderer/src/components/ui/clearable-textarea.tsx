import { useImperativeHandle, useRef } from 'react'
import type { ComponentProps } from 'react'
import { ClearButton } from './clear-button'

export function ClearableTextarea({
  ref,
  onClear,
  onLeave,
  className,
  ...props
}: Omit<ComponentProps<'textarea'>, 'onBlur'> & { onClear: () => void; onLeave?: () => void }) {
  const field = useRef<HTMLTextAreaElement>(null)
  useImperativeHandle(ref, () => field.current!, [])
  return (
    <span
      className="clearable-textarea"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onLeave?.()
      }}
    >
      <textarea {...props} ref={field} className={className} />
      {String(props.value ?? '').length > 0 && !props.disabled && !props.readOnly && (
        <ClearButton
          className="input-clear"
          label={props['aria-label'] ?? '输入内容'}
          onClear={onClear}
          focusField={() => field.current?.focus({ preventScroll: true })}
        />
      )}
    </span>
  )
}

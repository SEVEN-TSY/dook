import { useImperativeHandle, useRef } from 'react'
import type { ComponentProps } from 'react'
import { X } from 'lucide-react'

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
        <button
          type="button"
          className="input-clear"
          aria-label={`清除${props['aria-label'] ?? '输入内容'}`}
          title="清除"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onClear()
            field.current?.focus({ preventScroll: true })
          }}
        >
          <X size={10} aria-hidden="true" />
        </button>
      )}
    </span>
  )
}

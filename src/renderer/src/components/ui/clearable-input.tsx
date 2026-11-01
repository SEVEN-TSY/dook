import { useImperativeHandle, useRef } from 'react'
import type { ComponentProps } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

export type ClearableInputProps = ComponentProps<'input'> & {
  onClear?: () => void
}

export function ClearableInput({ ref, onClear, className, ...props }: ClearableInputProps) {
  const field = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => field.current!, [])
  return (
    <span className="clearable-input">
      <input {...props} ref={field} className={cn(className, onClear && 'pr-8')} />
      {onClear && String(props.value ?? '').length > 0 && !props.disabled && !props.readOnly && (
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
          <X size={10} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </span>
  )
}

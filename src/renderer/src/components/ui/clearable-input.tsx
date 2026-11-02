import { useImperativeHandle, useRef } from 'react'
import type { ComponentProps } from 'react'
import { ClearButton } from './clear-button'
import { cn } from '../../lib/utils'

export type ClearableInputProps = ComponentProps<'input'> & {
  onClear?: () => void
}

export function ClearableInput({ ref, onClear, className, ...props }: ClearableInputProps) {
  const field = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => field.current!, [])
  return (
    <span className="clearable-input">
      <input {...props} ref={field} className={cn(className, onClear && 'pr-6')} />
      {onClear && String(props.value ?? '').length > 0 && !props.disabled && !props.readOnly && (
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

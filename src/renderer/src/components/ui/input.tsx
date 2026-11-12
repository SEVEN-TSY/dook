import { cn } from '../../lib/utils'
import { ClearableInput } from './clearable-input'
import type { ClearableInputProps } from './clearable-input'

function Input({
  className,
  type,
  focusStyle = 'ring',
  ...props
}: ClearableInputProps & { focusStyle?: 'ring' | 'border' }) {
  return (
    <ClearableInput
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base motion-reduce:transition-none outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring',
        focusStyle === 'ring'
          ? 'shadow-xs transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50'
          : 'transition-[border-color]',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
        className
      )}
      {...props}
    />
  )
}

export { Input }

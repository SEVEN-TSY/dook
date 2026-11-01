import type { ComponentProps } from 'react'

/** Native checkbox semantics are shared by both windows; each layout controls its size. */
export function TaskCheck({ className = '', ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return <input {...props} type="checkbox" className={`task-check ${className}`} />
}

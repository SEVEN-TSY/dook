import { useState } from 'react'

/** Completed text expands for reading and native selection without entering an editor. */
export function ReadonlyDescription({
  description,
  className = '',
  testId
}: {
  description: string
  className?: string
  testId: string
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div
      className={`readonly-description ${expanded ? 'is-expanded' : ''} ${className}`}
      data-testid={testId}
      tabIndex={0}
      role="button"
      aria-expanded={expanded}
      title={description}
      onClick={() => setExpanded(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          setExpanded(!expanded)
        }
      }}
    >
      <span>{description}</span>
    </div>
  )
}

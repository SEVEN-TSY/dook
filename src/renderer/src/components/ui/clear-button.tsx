import { X } from 'lucide-react'

/** Clears a draft without moving focus or submitting its form. */
export function ClearButton({
  label,
  onClear,
  focusField,
  className = ''
}: {
  label: string
  onClear: () => void
  focusField: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      className={`draft-clear ${className}`}
      aria-label={`清除${label}`}
      title="清除"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        onClear()
        focusField()
      }}
    >
      <X size={10} aria-hidden="true" />
    </button>
  )
}

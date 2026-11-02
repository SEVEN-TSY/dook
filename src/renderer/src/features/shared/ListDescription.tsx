import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { ClearableTextarea } from '../../components/ui/clearable-textarea'
import { handleComposerKeyDown } from './InlineComposer'

type Draft = {
  value: string
  setValue: (value: string) => void
  save: () => Promise<boolean>
  submit: () => Promise<boolean>
  composing: RefObject<boolean>
  endComposition: () => void
}

/** Main-window list text: preview, editing, focus and submission share one behavior. */
export function ListDescription({
  description,
  editing,
  draft,
  onEdit,
  label,
  testId,
  previewTestId,
  className = ''
}: {
  description: string
  editing: boolean
  draft: Draft
  onEdit: () => void | Promise<void>
  label: string
  testId: string
  previewTestId: string
  className?: string
}) {
  const field = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    if (!editing || !field.current) return
    field.current.focus({ preventScroll: true })
    field.current.setSelectionRange(field.current.value.length, field.current.value.length)
  }, [editing])
  return editing ? (
    <ClearableTextarea
      ref={field}
      className="main-list-editor"
      rows={1}
      aria-label={label}
      data-testid={testId}
      value={draft.value}
      onClear={() => draft.setValue('')}
      onChange={(event) => draft.setValue(event.target.value)}
      onLeave={() => void draft.save()}
      onCompositionStart={() => {
        draft.composing.current = true
      }}
      onCompositionEnd={draft.endComposition}
      onKeyDown={(event) => handleComposerKeyDown(event, draft.setValue, draft.submit)}
    />
  ) : (
    <button
      className={`main-list-description ${className}`}
      data-testid={previewTestId}
      title={description}
      onClick={() => void onEdit()}
    >
      <span>{description}</span>
    </button>
  )
}

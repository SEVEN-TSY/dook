import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/** Brief feedback outside the document flow, without taking input focus. */
export function Toast({
  message,
  onDismiss,
  error = true
}: {
  message: string
  onDismiss: () => void
  error?: boolean
}) {
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => dismiss.current(), 3000)
    return () => window.clearTimeout(timer)
  }, [message])
  if (!message) return null
  return createPortal(
    <div className={`app-toast ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>
      {message}
    </div>,
    document.body
  )
}

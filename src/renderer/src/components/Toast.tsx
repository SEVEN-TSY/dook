import { useEffect, useId, useRef } from 'react'
import { toast } from 'sonner'

/** Bridge existing message state to the shared Sonner host. */
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
  const id = useId()
  dismiss.current = onDismiss
  useEffect(() => {
    if (!message) return
    let active = true
    const finish = () => {
      if (active) dismiss.current()
    }
    const notify = error ? toast.error : toast.success
    notify(message, { id, duration: 3000, onDismiss: finish, onAutoClose: finish })
    return () => {
      active = false
      toast.dismiss(id)
    }
  }, [message, error, id])
  return null
}

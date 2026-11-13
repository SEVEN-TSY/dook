import { useEffect, useId, useRef } from 'react'
import { dismissToast, toastError, toastSuccess } from './notify'

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
    const notify = error ? toastError : toastSuccess
    notify(message, { id, onDismiss: finish, onAutoClose: finish })
    return () => {
      active = false
      dismissToast(id)
    }
  }, [message, error, id])
  return null
}

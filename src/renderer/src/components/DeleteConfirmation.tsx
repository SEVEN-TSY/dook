import { lazy, Suspense, createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'

interface DeletePrompt {
  confirmLabel?: string
  title: string
  description: string
  detail: string
  focusAfterConfirm?: () => HTMLElement | null
}

const Context = createContext<{
  open: boolean
  cancel: () => void
  confirm: (prompt: DeletePrompt, returnFocus?: HTMLElement | null) => Promise<boolean>
} | null>(null)

const loadDialog = () => import('./DeleteConfirmationDialog')
const DeleteConfirmationDialog = lazy(() =>
  loadDialog().then((module) => ({ default: module.DeleteConfirmationDialog }))
)

export function DeleteConfirmationProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<DeletePrompt | null>(null)
  const pending = useRef<((confirmed: boolean) => void) | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const focusAfterConfirm = useRef<DeletePrompt['focusAfterConfirm']>(undefined)
  const confirmed = useRef(false)
  const finish = useCallback((result: boolean) => {
    if (!pending.current) return
    confirmed.current = result
    pending.current(result)
    pending.current = null
    setPrompt(null)
  }, [])
  const cancel = useCallback(() => finish(false), [finish])
  const closeAutoFocus = useCallback((event: Event) => {
    event.preventDefault()
    const trigger = confirmed.current ? focusAfterConfirm.current?.() : returnFocus.current
    const target =
      trigger?.isConnected &&
      trigger !== document.body &&
      trigger.checkVisibility() &&
      !trigger.matches(':disabled')
        ? trigger
        : document.querySelector<HTMLElement>('[data-delete-focus-fallback]')
    // 操作组先获得焦点，恢复由:focus-within展示的行内删除入口。
    target?.closest<HTMLElement>('[data-delete-focus-group]')?.focus({ preventScroll: true })
    target?.focus({ preventScroll: true })
  }, [])
  return (
    <Context.Provider
      value={{
        open: prompt !== null,
        cancel,
        confirm: (next, trigger) => {
          if (pending.current) return Promise.resolve(false)
          returnFocus.current =
            trigger ??
            (document.activeElement instanceof HTMLElement ? document.activeElement : null)
          confirmed.current = false
          focusAfterConfirm.current = next.focusAfterConfirm
          setPrompt(next)
          void loadDialog()
          return new Promise<boolean>((resolve) => {
            pending.current = resolve
          })
        }
      }}
    >
      {children}
      {prompt !== null && (
        <Suspense fallback={null}>
          <DeleteConfirmationDialog
            title={prompt.title}
            description={prompt.description}
            detail={prompt.detail}
            confirmLabel={prompt.confirmLabel}
            onOpenChange={(open) => {
              if (!open) finish(false)
            }}
            onEscapeKeyDown={() => finish(false)}
            onCloseAutoFocus={closeAutoFocus}
            onCancel={() => finish(false)}
            onConfirm={() => finish(true)}
          />
        </Suspense>
      )}
    </Context.Provider>
  )
}

export function useDeleteConfirmation() {
  const context = useContext(Context)
  if (!context) throw new Error('删除确认组件未加载。')
  return context
}

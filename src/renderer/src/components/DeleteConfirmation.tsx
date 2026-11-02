import { AlertDialog } from 'radix-ui'
import { createContext, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from './ui/button'

interface DeletePrompt {
  title: string
  description: string
  detail: string
}

const Context = createContext<{
  open: boolean
  confirm: (prompt: DeletePrompt) => Promise<boolean>
} | null>(null)

export function DeleteConfirmationProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<DeletePrompt | null>(null)
  const pending = useRef<((confirmed: boolean) => void) | null>(null)
  const finish = (confirmed: boolean) => {
    pending.current?.(confirmed)
    pending.current = null
    setPrompt(null)
  }
  return (
    <Context.Provider
      value={{
        open: prompt !== null,
        confirm: (next) => {
          if (pending.current) return Promise.resolve(false)
          setPrompt(next)
          return new Promise<boolean>((resolve) => {
            pending.current = resolve
          })
        }
      }}
    >
      {children}
      <AlertDialog.Root
        open={prompt !== null}
        onOpenChange={(open) => {
          if (!open) finish(false)
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="delete-confirmation-overlay" />
          <AlertDialog.Content
            className="delete-confirmation"
            onEscapeKeyDown={() => finish(false)}
          >
            <AlertDialog.Title>{prompt?.title}</AlertDialog.Title>
            <AlertDialog.Description asChild>
              <div className="delete-confirmation-description">
                <p>{prompt?.description}</p>
                <p>{prompt?.detail}</p>
              </div>
            </AlertDialog.Description>
            <div className="delete-confirmation-actions">
              <AlertDialog.Cancel asChild>
                <Button variant="outline" data-testid="delete-cancel" onClick={() => finish(false)}>
                  取消
                </Button>
              </AlertDialog.Cancel>
              <Button data-testid="delete-confirm" onClick={() => finish(true)}>
                删除
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Context.Provider>
  )
}

export function useDeleteConfirmation() {
  const context = useContext(Context)
  if (!context) throw new Error('删除确认组件未加载。')
  return context
}

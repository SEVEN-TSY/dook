import { AlertDialog } from 'radix-ui'
import { Button } from './ui/button'

/** 删除确认的浮层单独成块，只有真正弹出确认时才加载Radix对话框。 */
export function DeleteConfirmationDialog({
  title,
  description,
  detail,
  confirmLabel,
  onOpenChange,
  onEscapeKeyDown,
  onCloseAutoFocus,
  onCancel,
  onConfirm
}: {
  title: string
  description: string
  detail: string
  confirmLabel?: string
  onOpenChange: (open: boolean) => void
  onEscapeKeyDown: () => void
  onCloseAutoFocus: (event: Event) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog.Root open onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="delete-confirmation-overlay" />
        <AlertDialog.Content
          className="delete-confirmation"
          onEscapeKeyDown={onEscapeKeyDown}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <AlertDialog.Title>{title}</AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className="delete-confirmation-description">
              <p>{description}</p>
              <p>{detail}</p>
            </div>
          </AlertDialog.Description>
          <div className="delete-confirmation-actions">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" data-testid="delete-cancel" onClick={onCancel}>
                取消
              </Button>
            </AlertDialog.Cancel>
            <Button data-testid="delete-confirm" onClick={onConfirm}>
              {confirmLabel ?? '删除'}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

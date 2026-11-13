import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Dialog } from 'radix-ui'
import { toast } from 'sonner'
import type { AiScenePrompt, AiScenePromptSettings } from '../../../../shared/ai-scene-prompts'
import { Button } from '../../components/ui/button'
import { getDesktopApi, unwrap } from '../../platform/desktop'

export function AiScenePromptForm({
  scene,
  onClose,
  onSaved,
  returnFocus
}: {
  scene: AiScenePrompt
  onClose: () => void
  onSaved: (settings: AiScenePromptSettings) => void
  returnFocus: () => void
}) {
  const original = scene.customPrompt ?? scene.defaultPrompt
  const [draft, setDraft] = useState(original)
  const [viewDefault, setViewDefault] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  const fieldId = useId()
  const messageId = useId()
  const blank = !draft.trim()
  const canSave = !blank && draft !== original
  const message = viewDefault ? '' : error || (blank ? '提示词不能为空，请使用“恢复默认”。' : '')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving || viewDefault || !canSave) return
    setSaving(true)
    setError('')
    try {
      onSaved(unwrap(await getDesktopApi().saveAiScenePrompt(scene.id, draft)))
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法保存提示词。'
      setError(message)
      toast.error(message)
      setSaving(false)
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !saving && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="ai-dialog-overlay" />
        <Dialog.Content
          className="ai-dialog ai-prompt-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            field.current?.focus()
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            returnFocus()
          }}
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (saving) event.preventDefault()
          }}
        >
          <Dialog.Title>{scene.name}提示词</Dialog.Title>
          <Dialog.Description className="ai-dialog-description">
            调整写作风格、详略和侧重点。
          </Dialog.Description>
          <form className="ai-form-fields" onSubmit={submit}>
            <div className="ai-form-field">
              <div className="ai-prompt-field-heading">
                <label htmlFor={fieldId}>{viewDefault ? '默认提示词（只读）' : '编辑提示词'}</label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setViewDefault(!viewDefault)}
                >
                  {viewDefault ? '返回编辑' : '查看默认提示词'}
                </Button>
              </div>
              <textarea
                ref={field}
                id={fieldId}
                className="ai-prompt-text"
                value={viewDefault ? scene.defaultPrompt : draft}
                readOnly={viewDefault || saving}
                aria-invalid={!viewDefault && blank}
                aria-describedby={message ? messageId : undefined}
                onChange={(event) => {
                  setDraft(event.target.value)
                  setError('')
                }}
              />
              {message && (
                <p id={messageId} role={error ? 'alert' : 'status'} className="ai-prompt-error">
                  {message}
                </p>
              )}
            </div>
            <div className="ai-form-actions">
              <Dialog.Close asChild>
                <Button type="button" variant="outline" disabled={saving}>
                  取消
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={!canSave || viewDefault || saving}>
                {saving ? '正在保存…' : '保存'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Dialog } from 'radix-ui'
import type { AiPreset, AiSettings } from '../../../../shared/ai-settings'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select'
import { getDesktopApi, unwrap } from '../../platform/desktop'
import { AiModelLabel } from './AiModelLabel'

export function AiConfigurationForm({
  presets,
  initialId,
  replacing,
  onClose,
  onSaved,
  returnFocus
}: {
  presets: AiPreset[]
  initialId: string
  replacing: boolean
  onClose: () => void
  onSaved: (settings: AiSettings) => void
  returnFocus: () => void
}) {
  const [id, setId] = useState(initialId)
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const field = useRef<HTMLInputElement>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving || !key.trim()) return
    setSaving(true)
    setError('')
    try {
      onSaved(unwrap(await getDesktopApi().saveAiConfiguration(id, key)))
    } catch (error) {
      setError(error instanceof Error ? error.message : '无法保存AI配置。')
      setSaving(false)
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !saving && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="ai-dialog-overlay ai-form-overlay" />
        <Dialog.Content
          className="ai-dialog ai-configuration-form"
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
          <Dialog.Title>{replacing ? '更换API Key' : '创建配置'}</Dialog.Title>
          <Dialog.Description className="ai-dialog-description">
            验证只发送一条简短测试消息，可能产生少量API费用。API Key加密保存在本机。
          </Dialog.Description>
          <form className="ai-form-fields" onSubmit={submit}>
            {replacing ? (
              <AiModelLabel preset={presets[0]} />
            ) : (
              <div className="ai-form-field">
                <label htmlFor="ai-form-model">模型</label>
                <Select
                  value={id}
                  disabled={saving}
                  onValueChange={(next) => {
                    setId(next)
                    setError('')
                  }}
                >
                  <SelectTrigger id="ai-form-model" className="ai-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {presets.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id} textValue={preset.name}>
                        <AiModelLabel preset={preset} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="ai-form-field">
              <label htmlFor="ai-form-key">API Key</label>
              <Input
                ref={field}
                id="ai-form-key"
                type="password"
                focusStyle="border"
                autoComplete="off"
                spellCheck={false}
                maxLength={1024}
                value={key}
                readOnly={saving}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'ai-form-error' : undefined}
                onChange={(event) => {
                  setKey(event.target.value)
                  setError('')
                }}
              />
              {error && (
                <p id="ai-form-error" className="task-error" role="alert">
                  {error}
                </p>
              )}
            </div>
            <div className="ai-form-actions">
              <Dialog.Close asChild>
                <Button type="button" variant="outline" disabled={saving}>
                  取消
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={!key.trim() || saving}>
                {saving ? '正在验证…' : '验证并保存'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

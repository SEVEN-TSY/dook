import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Dialog } from 'radix-ui'
import { toast } from 'sonner'
import type { AiPreset, AiReasoning, AiSettings } from '../../../../shared/ai-settings'
import {
  AI_CONFIGURATION_NAME_LIMIT,
  AI_REASONING_LABELS,
  AI_REASONING_LEVELS
} from '../../../../shared/ai-settings'
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
  editing,
  onClose,
  onSaved,
  returnFocus
}: {
  presets: AiPreset[]
  initialId: string
  editing?: { id: string; name: string; reasoning: AiReasoning }
  onClose: () => void
  onSaved: (settings: AiSettings) => void
  returnFocus: () => void
}) {
  const [id, setId] = useState(initialId)
  const [nameDraft, setNameDraft] = useState(editing?.name)
  const [reasoningDraft, setReasoningDraft] = useState(editing?.reasoning)
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [error, setError] = useState('')
  const [errorField, setErrorField] = useState<'name' | 'key'>('key')
  const nameField = useRef<HTMLInputElement>(null)
  const keyField = useRef<HTMLInputElement>(null)
  const preset = presets.find((candidate) => candidate.id === id) ?? presets[0]
  const name = nameDraft ?? preset.name
  const reasoning = reasoningDraft ?? preset.reasoning
  const hasKey = Boolean(key.trim())
  const canSave =
    Boolean(name.trim()) &&
    (hasKey || (editing && (name.trim() !== editing.name || reasoning !== editing.reasoning)))

  // 主进程在退避期间不回报进度，首次退避为800毫秒，等待超过1秒后按重试状态提示。
  useEffect(() => {
    if (!saving || !hasKey) return
    const timer = setTimeout(() => setRetrying(true), 1000)
    return () => {
      clearTimeout(timer)
      setRetrying(false)
    }
  }, [saving, hasKey])

  const submitLabel = saving
    ? retrying && hasKey
      ? '正在重试…'
      : hasKey
        ? '正在验证…'
        : '正在保存…'
    : hasKey || !editing
      ? '验证并保存'
      : '保存'

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving || !canSave) return
    setSaving(true)
    setError('')
    try {
      const input = editing
        ? { id: editing.id, key: hasKey ? key : undefined, name, reasoning }
        : { presetId: preset.id, key, name, reasoning }
      const saved = unwrap(await getDesktopApi().saveAiConfiguration(input))
      toast.success(hasKey ? '连接验证通过，配置已保存。' : '配置已保存。')
      onSaved(saved)
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法保存AI配置。'
      const field =
        message.startsWith('配置名称已存在') || message.startsWith('名称长度') ? 'name' : 'key'
      setError(message)
      setErrorField(field)
      if (field === 'name') nameField.current?.focus()
      // 验证失败的可能原因包含网络、限流和重试次数，需留出阅读时间。
      toast.error(message, { duration: 4000 })
      setSaving(false)
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !saving && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="ai-dialog-overlay" />
        <Dialog.Content
          className="ai-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            const field = editing ? nameField : keyField
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
          <Dialog.Title>{editing ? '修改配置' : '创建配置'}</Dialog.Title>
          <Dialog.Description className="ai-dialog-description">
            新Key的验证只发送一条简短测试消息，可能产生少量API费用。
          </Dialog.Description>
          <form className="ai-form-fields" onSubmit={submit}>
            {editing ? (
              <AiModelLabel preset={preset} />
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
              <label htmlFor="ai-form-name">名称</label>
              <Input
                ref={nameField}
                id="ai-form-name"
                focusStyle="border"
                maxLength={AI_CONFIGURATION_NAME_LIMIT}
                value={name}
                readOnly={saving}
                aria-invalid={Boolean(error) && errorField === 'name'}
                aria-describedby={error && errorField === 'name' ? 'ai-form-error' : undefined}
                onChange={(event) => {
                  setNameDraft(event.target.value)
                  setError('')
                }}
              />
            </div>
            <div className="ai-form-field">
              <label htmlFor="ai-form-reasoning">推理强度</label>
              <Select
                value={reasoning}
                disabled={saving}
                onValueChange={(value) => {
                  setReasoningDraft(AI_REASONING_LEVELS.find((level) => level === value))
                  setError('')
                }}
              >
                <SelectTrigger id="ai-form-reasoning" className="ai-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_REASONING_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {AI_REASONING_LABELS[level]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="ai-form-field">
              <label htmlFor="ai-form-key">API Key</label>
              <Input
                ref={keyField}
                id="ai-form-key"
                type="password"
                focusStyle="border"
                autoComplete="off"
                spellCheck={false}
                placeholder={editing ? '********' : undefined}
                maxLength={1024}
                value={key}
                readOnly={saving}
                aria-invalid={Boolean(error) && errorField === 'key'}
                aria-describedby={error && errorField === 'key' ? 'ai-form-error' : undefined}
                onChange={(event) => {
                  setKey(event.target.value)
                  setError('')
                }}
              />
            </div>
            {error && (
              <p id="ai-form-error" className="sr-only" role="alert">
                {error}
              </p>
            )}
            <div className="ai-form-actions">
              <Dialog.Close asChild>
                <Button type="button" variant="outline" disabled={saving}>
                  取消
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={!canSave || saving}>
                {submitLabel}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

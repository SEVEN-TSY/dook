import { useEffect, useRef, useState } from 'react'
import { Cpu, KeyRound, Play, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import type { AiPreset, AiSettings as Settings } from '../../../../shared/ai-settings'
import { useDeleteConfirmation } from '../../components/DeleteConfirmation'
import { Button } from '../../components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select'
import { getDesktopApi, unwrap } from '../../platform/desktop'
import { AiConfigurationForm } from './AiConfigurationForm'
import { AiModelLabel } from './AiModelLabel'
import './ai-settings.css'

const reasoningLabels: Record<AiPreset['reasoning'], string> = {
  off: '关闭',
  low: '低',
  high: '高',
  max: '最高'
}

export function AiSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [managementOpen, setManagementOpen] = useState(false)
  const [form, setForm] = useState<{ replacing?: AiPreset } | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null)
  const [loadVersion, setLoadVersion] = useState(0)
  const formTrigger = useRef<HTMLElement>(null)
  const createButton = useRef<HTMLButtonElement>(null)
  const managementClose = useRef<HTMLButtonElement>(null)
  const deletion = useDeleteConfirmation()

  useEffect(() => {
    let current = true
    const load = async () => {
      try {
        const result = unwrap(await getDesktopApi().getAiSettings())
        if (current) setSettings(result)
      } catch (error) {
        if (current)
          setFeedback({
            message: error instanceof Error ? error.message : '无法读取AI配置。',
            error: true
          })
      }
    }
    void load()
    return () => {
      current = false
    }
  }, [loadVersion])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setFeedback(null)
    try {
      await action()
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : 'AI配置操作失败。',
        error: true
      })
    } finally {
      setBusy(false)
    }
  }

  const configured =
    settings?.presets.filter((preset) => settings.configuredIds.includes(preset.id)) ?? []
  const available =
    settings?.presets.filter((preset) => !settings.configuredIds.includes(preset.id)) ?? []
  const active = settings?.presets.find((preset) => preset.id === settings.activeId)
  const formPresets = form?.replacing ? [form.replacing] : available
  const formInitial =
    formPresets.find((preset) => preset.id === settings?.defaultId) ?? formPresets[0]
  const message = feedback && (
    <p
      className={feedback.error ? 'task-error' : 'ai-test-result'}
      role={feedback.error ? 'alert' : 'status'}
    >
      {feedback.message}
    </p>
  )

  return (
    <section className="settings-group settings-ai" aria-label="AI服务">
      <h2 className="settings-intro">
        <span className="settings-category-icon">
          <Cpu size={17} />
        </span>
        AI服务
      </h2>
      <div className="setting-row">
        <strong id="default-ai-label">默认配置</strong>
        <div className="ai-setting-controls">
          <Select
            value={active?.id ?? ''}
            disabled={!active || !configured.length || busy}
            onValueChange={(id) =>
              void run(async () => {
                setSettings(unwrap(await getDesktopApi().selectAiConfiguration(id)))
              })
            }
          >
            <SelectTrigger
              aria-labelledby="default-ai-label"
              className="ai-select ai-default-select"
            >
              <SelectValue placeholder={feedback?.error ? '配置不可用' : '正在读取…'}>
                {active && <AiModelLabel preset={active} unconfigured={!configured.length} />}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {configured.map((preset) => (
                <SelectItem key={preset.id} value={preset.id} textValue={preset.name}>
                  <AiModelLabel preset={preset} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog.Root
            open={managementOpen}
            onOpenChange={(open) => {
              setManagementOpen(open)
              if (settings && !busy) setFeedback(null)
            }}
          >
            <Dialog.Trigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="管理AI配置"
                title="管理AI配置"
              >
                <SlidersHorizontal />
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="ai-dialog-overlay" />
              <Dialog.Content
                className="ai-dialog ai-management"
                onOpenAutoFocus={(event) => {
                  event.preventDefault()
                  managementClose.current?.focus()
                }}
              >
                <div className="ai-dialog-heading">
                  <Dialog.Title>管理AI配置</Dialog.Title>
                  <Dialog.Close asChild>
                    <Button
                      ref={managementClose}
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="关闭管理AI配置"
                      title="关闭"
                    >
                      <X />
                    </Button>
                  </Dialog.Close>
                </div>
                <Dialog.Description className="ai-dialog-description">
                  测试连接可能产生少量API费用。
                </Dialog.Description>
                <div className="ai-table-toolbar">
                  <Button
                    ref={createButton}
                    size="sm"
                    disabled={!available.length || busy}
                    onClick={(event) => {
                      formTrigger.current = event.currentTarget
                      setForm({})
                      setFeedback(null)
                    }}
                  >
                    <Plus />
                    创建配置
                  </Button>
                </div>
                {settings ? (
                  <div className="ai-table-scroll">
                    <table className="ai-config-table">
                      <thead>
                        <tr>
                          <th scope="col">模型</th>
                          <th scope="col">推理强度</th>
                          <th scope="col">默认</th>
                          <th scope="col">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {configured.map((preset) => (
                          <tr key={preset.id}>
                            <td>
                              <AiModelLabel preset={preset} />
                              <small>{preset.model}</small>
                            </td>
                            <td>{reasoningLabels[preset.reasoning]}</td>
                            <td>
                              {preset.id === settings.activeId ? (
                                <span className="ai-active-model">默认</span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>
                              <div className="ai-table-actions">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  disabled={busy}
                                  title="测试连接"
                                  aria-label={`测试${preset.name}连接`}
                                  onClick={() =>
                                    void run(async () => {
                                      unwrap(await getDesktopApi().testAiConfiguration(preset.id))
                                      setFeedback({ message: `${preset.name}连接成功。` })
                                    })
                                  }
                                >
                                  <Play />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  disabled={busy}
                                  title="更换Key"
                                  aria-label={`更换${preset.name}的Key`}
                                  onClick={(event) => {
                                    formTrigger.current = event.currentTarget
                                    setForm({ replacing: preset })
                                    setFeedback(null)
                                  }}
                                >
                                  <KeyRound />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  disabled={busy}
                                  title="移除配置"
                                  aria-label={`移除${preset.name}配置`}
                                  onClick={async (event) => {
                                    if (
                                      await deletion.confirm(
                                        {
                                          title: '移除AI配置',
                                          description: `移除${preset.name}的配置？`,
                                          detail: '该配置保存的API Key将从DOOK移除。',
                                          confirmLabel: '移除'
                                        },
                                        event.currentTarget
                                      )
                                    ) {
                                      managementClose.current?.focus()
                                      void run(async () => {
                                        setSettings(
                                          unwrap(
                                            await getDesktopApi().removeAiConfiguration(preset.id)
                                          )
                                        )
                                      })
                                    }
                                  }}
                                >
                                  <Trash2 />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!configured.length && (
                          <tr>
                            <td colSpan={4} className="ai-table-empty">
                              尚未配置模型
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : feedback?.error ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setFeedback(null)
                      setLoadVersion((version) => version + 1)
                    }}
                  >
                    重试
                  </Button>
                ) : (
                  <p role="status" className="ai-dialog-description">
                    正在读取配置…
                  </p>
                )}
                {message}
                {form && formInitial && (
                  <AiConfigurationForm
                    presets={formPresets}
                    initialId={formInitial.id}
                    replacing={Boolean(form.replacing)}
                    onClose={() => setForm(null)}
                    onSaved={(next) => {
                      setSettings(next)
                      setForm(null)
                    }}
                    returnFocus={() => {
                      const trigger = formTrigger.current
                      if (trigger?.isConnected && !trigger.matches(':disabled')) trigger.focus()
                      else managementClose.current?.focus()
                    }}
                  />
                )}
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
      {!managementOpen && message}
    </section>
  )
}

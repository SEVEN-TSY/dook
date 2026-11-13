import { useEffect, useRef, useState } from 'react'
import { Cpu, Plus, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import type { AiSettings as Settings } from '../../../../shared/ai-settings'
import { formatCreatedTime } from '../../../../shared/created-time'
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
import { AiConfigurationActions } from './AiConfigurationActions'
import { AiConfigurationForm } from './AiConfigurationForm'
import { AiModelLabel } from './AiModelLabel'
import { AiScenePromptSettings } from './AiScenePromptSettings'
import './ai-settings.css'

export function AiSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [managementOpen, setManagementOpen] = useState(false)
  const [form, setForm] = useState<{ id?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadVersion, setLoadVersion] = useState(0)
  const formTrigger = useRef<HTMLElement>(null)
  const managementToggle = useRef<HTMLButtonElement>(null)
  const deletion = useDeleteConfirmation()

  useEffect(() => {
    let request = 0
    let unsubscribe: (() => void) | undefined
    const load = async () => {
      const current = ++request
      try {
        const result = unwrap(await getDesktopApi().getAiSettings())
        if (current === request) {
          setSettings(result)
          setLoadFailed(false)
        }
      } catch (error) {
        if (current === request) {
          setLoadFailed(true)
          toast.error(error instanceof Error ? error.message : '无法读取AI配置。')
        }
      }
    }
    try {
      unsubscribe = getDesktopApi().onAiCallLogged(() => void load())
    } catch {
      // Loading reports an unavailable desktop bridge.
    }
    void load()
    return () => {
      request++
      unsubscribe?.()
    }
  }, [loadVersion])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI配置操作失败。')
    } finally {
      setBusy(false)
    }
  }

  const configured =
    settings?.configurations.flatMap((configuration) => {
      const preset = settings.presets.find(({ id }) => id === configuration.presetId)
      return preset
        ? [
            {
              id: configuration.id,
              preset,
              name: configuration.name ?? preset.name,
              reasoning: configuration.reasoning ?? preset.reasoning,
              lastCalledAt: configuration.lastCalledAt,
              totalTokens: configuration.totalTokens
            }
          ]
        : []
    }) ?? []
  const active = configured.find(({ id }) => id === settings?.activeId)
  const editing = configured.find(({ id }) => id === form?.id)
  const formPresets = editing ? [editing.preset] : (settings?.presets ?? [])
  const formInitial =
    formPresets.find((preset) => preset.id === settings?.defaultId) ?? formPresets[0]

  return (
    <section className="settings-group settings-ai" aria-label="AI服务">
      <h2 className="settings-intro">
        <span className="settings-category-icon">
          <Cpu size={17} />
        </span>
        AI服务
      </h2>
      <div className="setting-row">
        <strong id="default-ai-label">默认模型</strong>
        <div className="ai-setting-controls">
          <Select
            value={active?.id ?? ''}
            disabled={!active || busy}
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
              <SelectValue placeholder={settings ? '' : loadFailed ? '配置不可用' : '正在读取…'}>
                {active && <AiModelLabel preset={active.preset} name={active.name} />}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {configured.map(({ id, preset, name }) => (
                <SelectItem key={id} value={id} textValue={name}>
                  <AiModelLabel preset={preset} name={name} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            ref={managementToggle}
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="管理AI配置"
            aria-expanded={managementOpen}
            aria-controls="ai-model-management"
            title="管理AI配置"
            onClick={() => setManagementOpen(!managementOpen)}
          >
            <SlidersHorizontal />
          </Button>
        </div>
      </div>
      <div id="ai-model-management" className="ai-management" hidden={!managementOpen}>
        <div className="ai-table-toolbar">
          <p className="ai-management-note">API Key使用系统加密，密文仅保存在本机。</p>
          <Button
            size="sm"
            disabled={!formPresets.length || busy}
            onClick={(event) => {
              formTrigger.current = event.currentTarget
              setForm({})
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
                  <th scope="col">名称</th>
                  <th scope="col">模型</th>
                  <th scope="col" className="ai-token-column">
                    总Token
                  </th>
                  <th scope="col">最后调用时间</th>
                  <th scope="col" className="ai-operation-column">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {configured.map(({ id, preset, name, reasoning, lastCalledAt, totalTokens }) => (
                  <tr key={id}>
                    <td>
                      <div className="ai-configuration-name">
                        <span title={name}>{name}</span>
                        {id === settings.activeId && (
                          <span className="ai-default-badge">default</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <AiModelLabel preset={preset} reasoning={reasoning} />
                    </td>
                    <td className="ai-token-column">
                      {totalTokens?.toLocaleString('zh-CN') ?? '—'}
                    </td>
                    <td>
                      {lastCalledAt ? (
                        <time
                          dateTime={lastCalledAt}
                          title={new Date(lastCalledAt).toLocaleString('zh-CN')}
                        >
                          {formatCreatedTime(lastCalledAt, undefined, 'second')}
                        </time>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="ai-operation-column">
                      <AiConfigurationActions
                        name={name}
                        disabled={busy}
                        onTest={() =>
                          void run(async () => {
                            unwrap(await getDesktopApi().testAiConfiguration(id))
                            toast.success(`${name}连接成功。`)
                          })
                        }
                        onEdit={(trigger) => {
                          formTrigger.current = trigger
                          setForm({ id })
                        }}
                        onRemove={async (trigger) => {
                          if (
                            await deletion.confirm(
                              {
                                title: '移除AI配置',
                                description: `移除${name}的配置？`,
                                detail: '该配置保存的API Key将从DOOK移除。',
                                confirmLabel: '移除'
                              },
                              trigger
                            )
                          ) {
                            managementToggle.current?.focus({ preventScroll: true })
                            void run(async () => {
                              setSettings(unwrap(await getDesktopApi().removeAiConfiguration(id)))
                            })
                          }
                        }}
                      />
                    </td>
                  </tr>
                ))}
                {!configured.length && (
                  <tr>
                    <td colSpan={5} className="ai-table-empty">
                      尚未配置模型
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : loadFailed ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setLoadFailed(false)
              setLoadVersion((version) => version + 1)
            }}
          >
            重试
          </Button>
        ) : (
          <p role="status" className="ai-management-note">
            正在读取配置…
          </p>
        )}
      </div>
      <AiScenePromptSettings />
      {managementOpen && form && formInitial && (
        <AiConfigurationForm
          presets={formPresets}
          initialId={formInitial.id}
          editing={editing}
          onClose={() => setForm(null)}
          onSaved={(next) => {
            setSettings(next)
            setForm(null)
          }}
          returnFocus={() => {
            const trigger = formTrigger.current
            if (trigger?.isConnected && !trigger.matches(':disabled')) trigger.focus()
            else managementToggle.current?.focus({ preventScroll: true })
          }}
        />
      )}
    </section>
  )
}

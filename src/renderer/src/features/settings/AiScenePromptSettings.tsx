import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AI_PROMPT_MODES } from '../../../../shared/ai-scene-prompts'
import type {
  AiPromptMode,
  AiScenePrompt,
  AiScenePromptSettings as Settings
} from '../../../../shared/ai-scene-prompts'
import { useDeleteConfirmation } from '../../components/DeleteConfirmation'
import { Button } from '../../components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { getDesktopApi, unwrap } from '../../platform/desktop'
import { AiScenePromptForm } from './AiScenePromptForm'

const modeLabels: Record<AiPromptMode, string> = { default: '默认', custom: '自定义' }

export function AiScenePromptSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadVersion, setLoadVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<AiScenePrompt | null>(null)
  const editTrigger = useRef<HTMLButtonElement>(null)
  const customMode = useRef<HTMLButtonElement>(null)
  const confirmation = useDeleteConfirmation()

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const next = unwrap(await getDesktopApi().getAiScenePrompts())
        if (active) setSettings(next)
      } catch (error) {
        if (!active) return
        setLoadFailed(true)
        toast.error(error instanceof Error ? error.message : '无法读取提示词设置。')
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [loadVersion])

  async function update(action: () => Promise<Settings>) {
    setBusy(true)
    try {
      setSettings(await action())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '无法更新提示词设置。')
    } finally {
      setBusy(false)
    }
  }

  async function restore(trigger: HTMLButtonElement, scene?: AiScenePrompt) {
    const confirmed = await confirmation.confirm(
      {
        title: scene ? '恢复默认提示词' : '全部恢复默认',
        description: scene
          ? `将${scene.name}的提示词恢复为默认？`
          : '将所有场景的提示词恢复为默认？',
        detail: '保存的自定义内容将被清除。',
        confirmLabel: '恢复默认',
        focusAfterConfirm: () => customMode.current
      },
      trigger
    )
    if (confirmed)
      await update(async () => unwrap(await getDesktopApi().resetAiScenePrompts(scene?.id)))
  }

  const expanded = settings?.mode === 'custom'

  return (
    <>
      <div className="setting-row ai-prompt-setting">
        <strong id="ai-prompt-mode-label">提示词</strong>
        <div className="ai-setting-controls">
          {settings ? (
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              aria-labelledby="ai-prompt-mode-label"
              value={settings.mode}
              onValueChange={(value) => {
                const mode = AI_PROMPT_MODES.find((candidate) => candidate === value)
                if (!busy && mode)
                  void update(async () => unwrap(await getDesktopApi().setAiPromptMode(mode)))
              }}
            >
              {AI_PROMPT_MODES.map((mode) => (
                <ToggleGroupItem
                  ref={mode === 'custom' ? customMode : undefined}
                  key={mode}
                  value={mode}
                  aria-label={`${modeLabels[mode]}提示词`}
                  aria-disabled={busy}
                  aria-controls={mode === 'custom' ? 'ai-scene-prompt-table' : undefined}
                  className="ai-prompt-mode"
                >
                  {modeLabels[mode]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
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
              正在读取提示词…
            </p>
          )}
        </div>
      </div>
      <div id="ai-scene-prompt-table" className="ai-management" hidden={!expanded}>
        <div className="ai-table-toolbar ai-prompt-toolbar">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !settings?.scenes.some(({ customPrompt }) => customPrompt !== null)}
            onClick={(event) => void restore(event.currentTarget)}
          >
            全部恢复默认
          </Button>
        </div>
        <div className="ai-table-scroll">
          <table className="ai-config-table" aria-label="AI场景">
            <thead>
              <tr>
                <th scope="col">场景</th>
                <th scope="col">状态</th>
                <th scope="col" className="ai-operation-column">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {settings?.scenes.map((scene) => (
                <tr key={scene.id}>
                  <td>{scene.name}</td>
                  <td>{scene.customPrompt === null ? '默认' : '已自定义'}</td>
                  <td className="ai-operation-column">
                    <div className="ai-prompt-row-actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        aria-label={`查看与编辑${scene.name}提示词`}
                        onClick={(event) => {
                          editTrigger.current = event.currentTarget
                          setEditing(scene)
                        }}
                      >
                        查看与编辑
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || scene.customPrompt === null}
                        aria-label={`恢复${scene.name}默认提示词`}
                        onClick={(event) => void restore(event.currentTarget, scene)}
                      >
                        恢复默认
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {editing && (
        <AiScenePromptForm
          scene={editing}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            setSettings(next)
            setEditing(null)
          }}
          returnFocus={() => editTrigger.current?.focus({ preventScroll: true })}
        />
      )}
    </>
  )
}

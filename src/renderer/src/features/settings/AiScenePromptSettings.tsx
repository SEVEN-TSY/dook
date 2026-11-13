import { useEffect, useRef, useState } from 'react'
import {
  CalendarDays,
  CalendarRange,
  CalendarCheck,
  ListTodo,
  NotebookText,
  FileText,
  Pencil,
  RotateCcw
} from 'lucide-react'
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
import { settingToggleItemClass } from './setting-toggle-style'

const modeLabels: Record<AiPromptMode, string> = { default: '默认', custom: '自定义' }
const sceneIcons = new Map([
  ['daily_report', CalendarCheck],
  ['weekly_report', CalendarRange],
  ['monthly_report', CalendarDays],
  ['inspiration_collection', NotebookText],
  ['reminder', ListTodo]
])

export function AiScenePromptSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadVersion, setLoadVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<{ scene: AiScenePrompt; readOnly: boolean } | null>(null)
  const dialogTrigger = useRef<HTMLButtonElement>(null)
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

  async function restore(trigger: HTMLButtonElement, scene: AiScenePrompt) {
    const confirmed = await confirmation.confirm(
      {
        title: '恢复默认提示词',
        description: `将${scene.name}的提示词恢复为默认？`,
        detail: '保存的自定义内容将被清除。',
        confirmLabel: '恢复默认',
        focusAfterConfirm: () => customMode.current
      },
      trigger
    )
    if (confirmed)
      await update(async () => unwrap(await getDesktopApi().resetAiScenePrompts(scene.id)))
  }

  const canEdit = settings?.mode === 'custom'

  function openPrompt(trigger: HTMLButtonElement, scene: AiScenePrompt) {
    dialogTrigger.current = trigger
    setDialog({
      scene: canEdit ? scene : { ...scene, customPrompt: null },
      readOnly: !canEdit
    })
  }

  return (
    <>
      <div className="setting-row ai-prompt-setting">
        <strong id="ai-prompt-mode-label">提示词</strong>
        <div className="ai-setting-controls">
          {settings ? (
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
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
                  className={settingToggleItemClass}
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
      {settings && (
        <ul className="ai-prompt-cards" aria-label="AI场景">
          {settings.scenes.map((scene) => {
            const isCustom = canEdit && scene.customPrompt !== null
            const Icon = sceneIcons.get(scene.id) ?? FileText
            return (
              <li key={scene.id} className="ai-prompt-card">
                <button
                  type="button"
                  className="ai-prompt-card-view"
                  disabled={busy}
                  aria-label={`${canEdit ? '编辑' : '查看'}${scene.name}提示词`}
                  aria-describedby={`ai-prompt-status-${scene.id}`}
                  onClick={(event) => openPrompt(event.currentTarget, scene)}
                >
                  <span className="ai-prompt-card-label">
                    <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
                    <strong>{scene.name}</strong>
                  </span>
                  <span
                    id={`ai-prompt-status-${scene.id}`}
                    className="ai-prompt-card-status"
                    data-custom={isCustom}
                  >
                    {isCustom ? '自定义' : 'default'}
                  </span>
                </button>
                {canEdit && (
                  <div className="ai-prompt-card-actions">
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      disabled={busy}
                      aria-label={`编辑${scene.name}提示词`}
                      title="编辑提示词"
                      onClick={(event) => openPrompt(event.currentTarget, scene)}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                    {isCustom && (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        disabled={busy}
                        aria-label={`恢复${scene.name}默认提示词`}
                        title="恢复默认"
                        onClick={(event) => void restore(event.currentTarget, scene)}
                      >
                        <RotateCcw aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {dialog && (
        <AiScenePromptForm
          scene={dialog.scene}
          readOnly={dialog.readOnly}
          onClose={() => setDialog(null)}
          onSaved={(next) => {
            setSettings(next)
            setDialog(null)
          }}
          returnFocus={() => dialogTrigger.current?.focus({ preventScroll: true })}
        />
      )}
    </>
  )
}

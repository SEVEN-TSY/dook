import { Cpu } from 'lucide-react'
import type { AiPreset, AiReasoning } from '../../../../shared/ai-settings'
import { AI_REASONING_LABELS } from '../../../../shared/ai-settings'
import deepSeekIcon from './deepseek.svg'

export function AiModelLabel({
  preset,
  name = preset.name,
  reasoning
}: {
  preset: AiPreset
  name?: string
  reasoning?: AiReasoning
}) {
  return (
    <span className="ai-model-label">
      {preset.provider === 'deepseek' ? (
        <img src={deepSeekIcon} alt="" width={16} height={16} />
      ) : (
        <Cpu size={16} aria-hidden="true" />
      )}
      <span className="ai-model-name" title={name}>
        {name}
      </span>
      {reasoning && (
        <span
          className="ai-reasoning-badge"
          data-reasoning={reasoning}
          title={`推理强度：${AI_REASONING_LABELS[reasoning]}`}
        >
          <span className="sr-only">推理强度：</span>
          {AI_REASONING_LABELS[reasoning]}
        </span>
      )}
    </span>
  )
}

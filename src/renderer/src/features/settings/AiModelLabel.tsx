import { Cpu } from 'lucide-react'
import type { AiPreset } from '../../../../shared/ai-settings'
import deepSeekIcon from './deepseek.svg'

export function AiModelLabel({
  preset,
  unconfigured = false
}: {
  preset: AiPreset
  unconfigured?: boolean
}) {
  return (
    <span className="ai-model-label">
      {preset.provider === 'deepseek' ? (
        <img src={deepSeekIcon} alt="" width={16} height={16} />
      ) : (
        <Cpu size={16} aria-hidden="true" />
      )}
      <span>
        {preset.name}
        {unconfigured && ' · 未配置'}
      </span>
    </span>
  )
}

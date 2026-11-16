export const AI_REASONING_LEVELS = ['off', 'low', 'high', 'max'] as const
export type AiReasoning = (typeof AI_REASONING_LEVELS)[number]
export type AiStreamPhase = 'waiting' | 'reasoning' | 'generating'
export const AI_REASONING_LABELS: Record<AiReasoning, string> = {
  off: '关闭',
  low: '低',
  high: '高',
  max: '最高'
}

export interface AiPreset {
  id: string
  provider: string
  providerName: string
  name: string
  model: string
  reasoning: AiReasoning
}

export interface AiConfiguration {
  id: string
  presetId: string
  name?: string
  reasoning?: AiReasoning
}

export type AiConfigurationInput = {
  name?: string
  reasoning?: AiReasoning
} & ({ presetId: string; key: string; id?: never } | { id: string; key?: string; presetId?: never })

export interface AiSettings {
  presets: AiPreset[]
  defaultId: string
  activeId: string | null
  configurations: (AiConfiguration & { lastCalledAt: string | null; totalTokens: number | null })[]
}
export const AI_CONFIGURATION_NAME_LIMIT = 60

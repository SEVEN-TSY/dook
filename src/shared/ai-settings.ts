export interface AiPreset {
  id: string
  provider: string
  providerName: string
  name: string
  model: string
  reasoning: 'off' | 'low' | 'high' | 'max'
}

export interface AiSettings {
  presets: AiPreset[]
  defaultId: string
  activeId: string
  configuredIds: string[]
}

export const AI_PROMPT_MODES = ['default', 'custom'] as const
export type AiPromptMode = (typeof AI_PROMPT_MODES)[number]

export interface AiScenePrompt {
  id: string
  name: string
  defaultPrompt: string
  customPrompt: string | null
}

export interface AiScenePromptSettings {
  mode: AiPromptMode
  scenes: AiScenePrompt[]
}

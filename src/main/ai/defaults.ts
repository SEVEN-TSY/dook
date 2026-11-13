import type { AiPreset } from '../../shared/ai-settings'

const deepseek = {
  provider: 'deepseek',
  providerName: 'DeepSeek',
  endpoint: 'https://api.deepseek.com/chat/completions',
  reasoning: 'high'
} as const

export const aiDefaults = {
  defaultId: 'deepseek-flash',
  legacyDeepSeekId: 'deepseek-flash',
  timeoutMs: 60_000,
  testPrompt: 'Reply OK.',
  testMaxTokens: 16,
  thinkingTestMaxTokens: 2048,
  completionMaxTokens: 8192,
  stream: false,
  presets: [
    { ...deepseek, id: 'deepseek-flash', model: 'deepseek-flash', name: 'DeepSeek V4.1 Flash' },
    { ...deepseek, id: 'deepseek-v4-pro', model: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' }
  ] satisfies (AiPreset & { endpoint: string })[]
}

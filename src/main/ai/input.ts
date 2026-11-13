import { z } from 'zod'
import { AI_REASONING_LEVELS } from '../../shared/ai-settings'
import type { AiConfigurationInput } from '../../shared/ai-settings'

const fields = {
  name: z.string().optional(),
  reasoning: z.enum(AI_REASONING_LEVELS).optional()
}
const schema = z.union([
  z.strictObject({ ...fields, presetId: z.string(), key: z.string() }),
  z.strictObject({ ...fields, id: z.string(), key: z.string().optional() })
])

/** 只在保存AI配置时加载，避免zod进入启动关键路径。 */
export function parseAiConfigurationInput(input: unknown): AiConfigurationInput {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw new Error('AI配置参数无效。')
  return parsed.data
}

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { AI_PROMPT_MODES } from '../../shared/ai-scene-prompts'
import { writeAtomic } from './atomic-file'

const storedPrompts = z.object({
  mode: z.enum(AI_PROMPT_MODES),
  overrides: z.record(
    z.string(),
    z.string().refine((prompt) => Boolean(prompt.trim()))
  )
})
export type StoredAiScenePrompts = z.infer<typeof storedPrompts>

export class AiScenePromptStore {
  private readonly path: string

  constructor(directory: string) {
    this.path = join(directory, 'ai-scene-prompts.json')
  }

  load(): StoredAiScenePrompts {
    try {
      return storedPrompts.parse(JSON.parse(readFileSync(this.path, 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { mode: 'default', overrides: {} }
      throw new Error('无法读取提示词设置。')
    }
  }

  write(settings: StoredAiScenePrompts): void {
    try {
      writeAtomic(this.path, `${JSON.stringify(settings, null, 2)}\n`)
    } catch {
      throw new Error('无法保存提示词设置。')
    }
  }
}

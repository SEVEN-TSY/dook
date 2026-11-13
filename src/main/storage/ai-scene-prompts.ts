import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { AI_PROMPT_MODES } from '../../shared/ai-scene-prompts'
import type { AiPromptMode } from '../../shared/ai-scene-prompts'
import { writeAtomic } from './atomic-file'

const modeSchema = z.enum(AI_PROMPT_MODES)
const sceneId = z.string().regex(/^[a-z][a-z0-9_-]*$/)
const legacySchema = z.object({
  mode: modeSchema,
  overrides: z.record(sceneId, z.string())
})

function readOptional(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

export class AiScenePromptStore {
  private readonly directory: string
  private readonly modePath: string
  private readonly legacyPath: string

  constructor(dataDirectory: string) {
    this.directory = join(dataDirectory, 'ai-scene-prompts')
    this.modePath = join(dataDirectory, 'ai-prompt-mode.json')
    this.legacyPath = join(dataDirectory, 'ai-scene-prompts.json')
  }

  loadMode(): AiPromptMode {
    try {
      const stored = readOptional(this.modePath)
      if (stored !== undefined) return modeSchema.parse(JSON.parse(stored))
      const legacy = readOptional(this.legacyPath)
      if (legacy === undefined) return 'default'
      const { mode, overrides } = legacySchema.parse(JSON.parse(legacy))
      for (const [id, prompt] of Object.entries(overrides)) {
        if (prompt.trim()) this.writePrompt(id, prompt)
      }
      // Commit the migration only after all scene files have been written.
      this.writeMode(mode)
      try {
        rmSync(this.legacyPath, { force: true })
      } catch {
        // The migrated settings remain active if cleanup fails.
      }
      return mode
    } catch {
      throw new Error('无法读取提示词设置。')
    }
  }

  loadPrompt(id: string): string | null {
    try {
      const prompt = readOptional(this.promptPath(id))
      return prompt?.trim() ? prompt : null
    } catch {
      throw new Error('无法读取场景提示词。')
    }
  }

  writeMode(mode: AiPromptMode): void {
    try {
      writeAtomic(this.modePath, `${JSON.stringify(mode)}\n`)
    } catch {
      throw new Error('无法保存提示词设置。')
    }
  }

  writePrompt(id: string, prompt: string): void {
    try {
      mkdirSync(this.directory, { recursive: true })
      writeAtomic(this.promptPath(id), prompt)
    } catch {
      throw new Error('无法保存提示词。')
    }
  }

  reset(id: string): void {
    try {
      rmSync(this.promptPath(id), { force: true })
    } catch {
      throw new Error('无法恢复默认提示词。')
    }
  }

  promptPath(id: string): string {
    return join(this.directory, `${sceneId.parse(id)}.md`)
  }
}

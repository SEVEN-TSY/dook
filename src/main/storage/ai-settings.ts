import { readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { AI_REASONING_LEVELS } from '../../shared/ai-settings'
import type { AiConfiguration, AiReasoning } from '../../shared/ai-settings'
import { aiDefaults } from '../ai/defaults'

const configurationId = z.string().regex(/^[a-z0-9-]+$/)
const metadataSchema = z.object({
  activeId: z.string().nullable(),
  configurations: z.array(
    z.object({
      id: configurationId,
      presetId: configurationId,
      name: z.string().optional(),
      reasoning: z.enum(AI_REASONING_LEVELS).optional()
    })
  )
})
const legacyMetadataSchema = z.object({
  activeId: z.string(),
  configuredIds: z.array(configurationId),
  names: z.record(z.string(), z.string()).optional()
})
type Metadata = z.infer<typeof metadataSchema>

function parseMetadata(stored: string): Metadata {
  const data: unknown = JSON.parse(stored)
  if (data && typeof data === 'object' && 'configurations' in data)
    return metadataSchema.parse(data)
  const legacy = legacyMetadataSchema.parse(data)
  return {
    activeId: legacy.activeId,
    configurations: legacy.configuredIds.map((presetId) => ({
      id: presetId,
      presetId,
      name: legacy.names?.[presetId]
    }))
  }
}

function ignoreMissing<T>(operation: () => T): T | undefined {
  try {
    return operation()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

function cleanUp(path: string) {
  try {
    rmSync(path, { force: true })
  } catch {
    // Cleanup of an unreferenced file can be retried on the next load.
  }
}

function writeAtomic(path: string, data: Buffer | string) {
  const temporary = `${path}.tmp`
  try {
    writeFileSync(temporary, data, { mode: 0o600 })
    renameSync(temporary, path)
  } catch (error) {
    cleanUp(temporary)
    throw error
  }
}

export class AiSettingsStore {
  private readonly settingsPath: string
  private readonly legacyPath: string

  constructor(private readonly directory: string) {
    this.settingsPath = join(directory, 'ai-settings.json')
    this.legacyPath = join(directory, 'deepseek-key')
  }

  load(): Metadata {
    try {
      const stored = ignoreMissing(() => readFileSync(this.settingsPath, 'utf8'))
      const metadata = stored === undefined ? this.migrateLegacyKey() : parseMetadata(stored)
      this.recoverCredentials(metadata)
      const configurations = metadata.configurations.flatMap((row) => {
        const preset = aiDefaults.presets.find(({ id }) => id === row.presetId)
        if (!preset) return []
        const name = !row.name || row.name === row.presetId ? preset.name : row.name
        return [{ ...row, name }]
      })
      return {
        configurations,
        activeId: configurations.some(({ id }) => id === metadata.activeId)
          ? metadata.activeId
          : (configurations[0]?.id ?? null)
      }
    } catch {
      throw new Error('无法读取AI配置。')
    }
  }

  save(
    changes: {
      id: string
      isNew: boolean
      presetId: string
      name?: string
      reasoning: AiReasoning
    },
    encrypted?: Buffer
  ): Metadata {
    const metadata = this.load()
    const { id } = changes
    const existing = metadata.configurations.find((row) => row.id === id)
    if (changes.isNew ? existing || !encrypted : !existing)
      throw new Error('请先配置该模型的API Key。')
    const configuration: AiConfiguration = {
      id,
      presetId: changes.presetId,
      name: changes.name ?? existing?.name,
      reasoning: changes.reasoning
    }
    const next = {
      activeId: metadata.configurations.length ? metadata.activeId : id,
      configurations: existing
        ? metadata.configurations.map((row) => (row.id === id ? configuration : row))
        : [...metadata.configurations, configuration]
    }
    if (!encrypted) return this.writeMetadata(next)

    const path = this.keyPath(id)
    const metadataChanged =
      existing &&
      (existing.name !== configuration.name || existing.reasoning !== configuration.reasoning)
    // A replacement leaves the original key in place if the metadata write fails.
    if (metadataChanged) this.writeMetadata(next)
    try {
      writeAtomic(path, encrypted)
    } catch {
      if (metadataChanged) this.writeMetadata(metadata)
      throw new Error('无法保存AI配置。')
    }
    if (existing) return next
    try {
      return this.writeMetadata(next)
    } catch (error) {
      cleanUp(path)
      throw error
    }
  }

  select(id: string): Metadata {
    const metadata = this.load()
    this.requireConfigured(metadata, id)
    return this.writeMetadata({ ...metadata, activeId: id })
  }

  remove(id: string): Metadata {
    const metadata = this.load()
    this.requireConfigured(metadata, id)
    const configurations = metadata.configurations.filter((row) => row.id !== id)
    const activeId = metadata.activeId === id ? (configurations[0]?.id ?? null) : metadata.activeId
    const path = this.keyPath(id)
    const staged = `${path}.removing`
    try {
      if (id === aiDefaults.legacyDeepSeekId) rmSync(this.legacyPath, { force: true })
      ignoreMissing(() => renameSync(path, staged))
      const next = this.writeMetadata({ activeId, configurations })
      try {
        rmSync(staged, { force: true })
      } catch (error) {
        this.writeMetadata(metadata)
        throw error
      }
      return next
    } catch {
      // load() restores a staged key if the metadata still references it.
      throw new Error('无法移除AI配置。')
    }
  }

  readKey(id: string, metadata: Metadata): Buffer {
    this.requireConfigured(metadata, id)
    try {
      return readFileSync(this.keyPath(id))
    } catch {
      throw new Error('无法读取API Key，请重新保存Key。')
    }
  }

  private requireConfigured(metadata: Metadata, id: string) {
    if (!metadata.configurations.some((row) => row.id === id))
      throw new Error('请先配置该模型的API Key。')
  }

  private keyPath(id: string): string {
    return join(this.directory, `ai-${id}.key`)
  }

  private writeMetadata(metadata: Metadata): Metadata {
    try {
      writeAtomic(this.settingsPath, `${JSON.stringify(metadata, null, 2)}\n`)
      return metadata
    } catch {
      throw new Error('无法保存AI配置。')
    }
  }

  private migrateLegacyKey(): Metadata {
    const legacy = ignoreMissing(() => readFileSync(this.legacyPath))
    if (!legacy) return { activeId: null, configurations: [] }
    const id = aiDefaults.legacyDeepSeekId
    const preset = aiDefaults.presets.find((candidate) => candidate.id === id)
    writeAtomic(this.keyPath(id), legacy)
    return this.writeMetadata({
      activeId: id,
      configurations: [{ id, presetId: id, name: preset?.name }]
    })
  }

  private recoverCredentials(metadata: Metadata) {
    // Metadata decides whether an interrupted file operation committed.
    const ids = new Set(metadata.configurations.map(({ id }) => id))
    for (const id of ids) {
      const path = this.keyPath(id)
      ignoreMissing(() => renameSync(`${path}.removing`, path))
    }
    for (const file of ignoreMissing(() => readdirSync(this.directory)) ?? []) {
      const match = /^ai-([a-z0-9-]+)\.key(?:\.removing)?$/.exec(file)
      if (match && !ids.has(match[1])) cleanUp(join(this.directory, file))
    }
    if (ids.has(aiDefaults.legacyDeepSeekId)) cleanUp(this.legacyPath)
  }
}

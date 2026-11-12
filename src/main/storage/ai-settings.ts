import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { aiDefaults } from '../ai/defaults'

const metadataSchema = z.object({ activeId: z.string(), configuredIds: z.array(z.string()) })
type Metadata = z.infer<typeof metadataSchema>

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
      const metadata =
        stored === undefined ? this.migrateLegacyKey() : metadataSchema.parse(JSON.parse(stored))
      this.recoverCredentials(metadata)
      const configuredIds = [...new Set(metadata.configuredIds)].filter((id) =>
        aiDefaults.presets.some((preset) => preset.id === id)
      )
      return {
        configuredIds,
        activeId: configuredIds.includes(metadata.activeId)
          ? metadata.activeId
          : (configuredIds[0] ?? aiDefaults.defaultId)
      }
    } catch {
      throw new Error('无法读取AI配置。')
    }
  }

  saveKey(id: string, encrypted: Buffer): Metadata {
    const metadata = this.load()
    const path = this.keyPath(id)
    try {
      writeAtomic(path, encrypted)
    } catch {
      throw new Error('无法保存AI配置。')
    }
    if (metadata.configuredIds.includes(id)) return metadata
    const next = {
      activeId: metadata.configuredIds.length ? metadata.activeId : id,
      configuredIds: [...metadata.configuredIds, id]
    }
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
    const configuredIds = metadata.configuredIds.filter((candidate) => candidate !== id)
    const activeId =
      metadata.activeId === id ? (configuredIds[0] ?? aiDefaults.defaultId) : metadata.activeId
    const path = this.keyPath(id)
    const staged = `${path}.removing`
    try {
      if (id === aiDefaults.legacyDeepSeekId) rmSync(this.legacyPath, { force: true })
      ignoreMissing(() => renameSync(path, staged))
      const next = this.writeMetadata({ activeId, configuredIds })
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
    if (!metadata.configuredIds.includes(id)) throw new Error('请先配置该模型的API Key。')
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
    if (!legacy) return { activeId: aiDefaults.defaultId, configuredIds: [] }
    const id = aiDefaults.legacyDeepSeekId
    writeAtomic(this.keyPath(id), legacy)
    return this.writeMetadata({ activeId: id, configuredIds: [id] })
  }

  private recoverCredentials(metadata: Metadata) {
    // Metadata decides whether an interrupted file operation committed.
    for (const { id } of aiDefaults.presets) {
      const path = this.keyPath(id)
      const staged = `${path}.removing`
      if (metadata.configuredIds.includes(id)) {
        ignoreMissing(() => renameSync(staged, path))
      } else {
        cleanUp(staged)
        cleanUp(path)
      }
    }
    if (metadata.configuredIds.includes(aiDefaults.legacyDeepSeekId)) cleanUp(this.legacyPath)
  }
}

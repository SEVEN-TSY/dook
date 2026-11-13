import { randomUUID } from 'node:crypto'
import type { AiConfigurationInput, AiPreset, AiSettings } from '../../shared/ai-settings'
import { AI_CONFIGURATION_NAME_LIMIT } from '../../shared/ai-settings'
import { readAiUsage } from '../storage/ai-call-log'
import type { AiCallEntry, AiCallLog, AiCompletionEvent } from '../storage/ai-call-log'
import { AiSettingsStore } from '../storage/ai-settings'
import { aiDefaults } from './defaults'

interface Encryption {
  available(): Promise<boolean>
  encrypt(key: string): Promise<Buffer>
  decrypt(bytes: Buffer): Promise<string>
}

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface CompletionOptions {
  signal?: AbortSignal
  json?: boolean
}

type Preset = AiPreset & { endpoint: string }
type Metadata = ReturnType<AiSettingsStore['load']>

export class AiConnection {
  private readonly store: AiSettingsStore
  private pendingSave = Promise.resolve()

  constructor(
    directory: string,
    private readonly encryption: Encryption,
    private readonly callLog: AiCallLog,
    private readonly request: typeof fetch = fetch,
    private readonly onCallLogged: () => void = () => {}
  ) {
    this.store = new AiSettingsStore(directory)
  }

  getSettings(): AiSettings {
    return this.settings(this.store.load())
  }

  private settings(metadata: Metadata): AiSettings {
    return {
      ...metadata,
      configurations: metadata.configurations.map((configuration) => ({
        ...configuration,
        ...this.callLog.summarize(configuration.id)
      })),
      defaultId: aiDefaults.defaultId,
      presets: aiDefaults.presets.map(({ endpoint: _endpoint, ...preset }) => preset)
    }
  }

  save(input: AiConfigurationInput): Promise<AiSettings> {
    const save = this.pendingSave.then(async () => {
      const metadata = this.store.load()
      const current = input.id === undefined ? undefined : this.configuration(metadata, input.id)
      const preset = this.preset(current?.presetId ?? input.presetId)
      const reasoning = input.reasoning ?? current?.reasoning ?? preset.reasoning
      const trimmedName = input.name?.trim()
      if (
        trimmedName !== undefined &&
        (!trimmedName || trimmedName.length > AI_CONFIGURATION_NAME_LIMIT)
      )
        throw new Error(`名称长度须为1至${AI_CONFIGURATION_NAME_LIMIT}个字符。`)
      const currentName = current?.name ?? preset.name
      const nextName = trimmedName ?? currentName
      if (
        (!current || nextName !== currentName) &&
        metadata.configurations.some(
          (row) =>
            row.id !== input.id &&
            (row.name ?? this.preset(row.presetId).name).trim().toLowerCase() ===
              nextName.toLowerCase()
        )
      )
        throw new Error('配置名称已存在，请换一个名称。')
      const id = current?.id ?? randomUUID()
      const changes = { id, isNew: !current, presetId: preset.id, name: nextName, reasoning }
      if (input.key === undefined) return this.settings(this.store.save(changes))
      const key = input.key.trim()
      if (!/^[!-~]{1,1024}$/.test(key)) throw new Error('请输入有效的API Key。')
      await this.verify(id, { ...preset, reasoning }, key, 'verify')
      let encrypted: Buffer
      try {
        if (!(await this.encryption.available())) throw new Error()
        encrypted = await this.encryption.encrypt(key)
      } catch {
        throw new Error('系统加密不可用，无法保存API Key。')
      }

      return this.settings(this.store.save(changes, encrypted))
    })
    this.pendingSave = save.then(
      () => {},
      () => {}
    )
    return save
  }

  select(id: string): AiSettings {
    return this.settings(this.store.select(id))
  }

  remove(id: string): AiSettings {
    return this.settings(this.store.remove(id))
  }

  async test(id: string): Promise<void> {
    const { preset, key } = await this.savedCredential(this.store.load(), id)
    await this.verify(id, preset, key, 'test')
  }

  async complete(
    event: AiCompletionEvent,
    messages: Message[],
    options: CompletionOptions = {}
  ): Promise<string> {
    const metadata = this.store.load()
    const { id, preset, key } = await this.savedCredential(metadata, metadata.activeId)
    return this.send(id, event, preset, key, messages, aiDefaults.completionMaxTokens, options)
  }

  private preset(id: string | undefined): Preset {
    const preset = aiDefaults.presets.find((candidate) => candidate.id === id)
    if (!preset) throw new Error('AI配置预设无效。')
    return preset
  }

  private configuration(metadata: Metadata, id: string | null) {
    const configuration = metadata.configurations.find((row) => row.id === id)
    if (!configuration) throw new Error('请先配置该模型的API Key。')
    return configuration
  }

  private async savedCredential(metadata: Metadata, id: string | null) {
    const configuration = this.configuration(metadata, id)
    const preset = this.preset(configuration.presetId)
    const encrypted = this.store.readKey(configuration.id, metadata)
    try {
      if (!(await this.encryption.available())) throw new Error()
      const key = await this.encryption.decrypt(encrypted)
      return {
        id: configuration.id,
        preset: { ...preset, reasoning: configuration.reasoning ?? preset.reasoning },
        key
      }
    } catch {
      throw new Error('无法解密API Key，请检查系统加密或重新保存Key。')
    }
  }

  private async verify(id: string, preset: Preset, key: string, event: 'verify' | 'test') {
    await this.send(
      id,
      event,
      preset,
      key,
      [{ role: 'user', content: aiDefaults.testPrompt }],
      preset.reasoning === 'off' ? aiDefaults.testMaxTokens : aiDefaults.thinkingTestMaxTokens
    )
  }

  private async send(
    configurationId: string,
    event: AiCallEntry['event'],
    preset: Preset,
    key: string,
    messages: Message[],
    maxTokens: number,
    options: CompletionOptions = {}
  ): Promise<string> {
    const timeout = AbortSignal.timeout(aiDefaults.timeoutMs)
    const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout
    const requestError = (message: string) =>
      new Error(
        options.signal?.aborted ? '请求已取消。' : timeout.aborted ? 'AI服务请求超时。' : message
      )
    if (signal.aborted) throw requestError('请求已取消。')
    const calledAt = new Date().toISOString()
    const started = performance.now()
    let httpStatus: number | undefined
    let usage: AiCallEntry['usage']
    let outcome: AiCallEntry['outcome'] = 'error'
    try {
      let response: Response
      try {
        response = await this.request(preset.endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          redirect: 'error',
          signal,
          body: JSON.stringify({
            model: preset.model,
            messages,
            thinking: { type: preset.reasoning === 'off' ? 'disabled' : 'enabled' },
            reasoning_effort: preset.reasoning === 'off' ? undefined : preset.reasoning,
            stream: aiDefaults.stream,
            max_tokens: maxTokens,
            response_format: options.json ? { type: 'json_object' } : undefined
          })
        })
      } catch {
        throw requestError('无法连接AI服务，请检查网络。')
      }

      httpStatus = response.status
      if (!response.ok) {
        void response.body?.cancel().catch(() => {})
        switch (response.status) {
          case 401:
          case 403:
            throw new Error('AI服务鉴权失败，请检查API Key。')
          case 402:
            throw new Error('AI服务账户余额不足。')
          case 429:
            throw new Error('AI服务请求被限流，请稍后重试。')
          default:
            throw new Error('AI服务请求失败，请稍后重试。')
        }
      }

      try {
        const result = (await response.json()) as {
          usage?: unknown
          choices?: { finish_reason?: string; message?: { content?: string } }[]
        }
        usage = readAiUsage(result?.usage)
        const choice = result?.choices?.[0]
        const content = choice?.message?.content
        if (choice?.finish_reason !== 'stop' || typeof content !== 'string' || !content.trim())
          throw new Error()
        outcome = 'success'
        return content
      } catch {
        throw requestError('AI服务返回了无效或不完整的响应。')
      }
    } finally {
      if (outcome !== 'success') {
        if (options.signal?.aborted) outcome = 'cancelled'
        else if (timeout.aborted) outcome = 'timeout'
      }
      this.callLog.append({
        configurationId,
        model: preset.model,
        event,
        calledAt,
        durationMs: Math.round(performance.now() - started),
        outcome,
        httpStatus,
        usage
      })
      this.onCallLogged()
    }
  }
}

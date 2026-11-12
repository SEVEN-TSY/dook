import type { AiSettings } from '../../shared/ai-settings'
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

type Preset = (typeof aiDefaults.presets)[number]
type Metadata = ReturnType<AiSettingsStore['load']>

export class AiConnection {
  private readonly store: AiSettingsStore
  private pendingSave = Promise.resolve()

  constructor(
    directory: string,
    private readonly encryption: Encryption,
    private readonly request: typeof fetch = fetch
  ) {
    this.store = new AiSettingsStore(directory)
  }

  getSettings(): AiSettings {
    return this.settings(this.store.load())
  }

  private settings(metadata: Metadata): AiSettings {
    return {
      ...metadata,
      defaultId: aiDefaults.defaultId,
      presets: aiDefaults.presets.map(({ endpoint: _endpoint, ...preset }) => preset)
    }
  }

  save(id: string, value: string): Promise<AiSettings> {
    const save = this.pendingSave.then(async () => {
      const preset = this.preset(id)
      const key = value.trim()
      if (!/^[!-~]{1,1024}$/.test(key)) throw new Error('请输入有效的API Key。')
      await this.verify(preset, key)
      let encrypted: Buffer
      try {
        if (!(await this.encryption.available())) throw new Error()
        encrypted = await this.encryption.encrypt(key)
      } catch {
        throw new Error('系统加密不可用，无法保存API Key。')
      }

      return this.settings(this.store.saveKey(id, encrypted))
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
    await this.verify(preset, key)
  }

  async complete(messages: Message[], options: CompletionOptions = {}): Promise<string> {
    const metadata = this.store.load()
    const { preset, key } = await this.savedCredential(metadata, metadata.activeId)
    return this.send(preset, key, messages, aiDefaults.completionMaxTokens, options)
  }

  private preset(id: string): Preset {
    const preset = aiDefaults.presets.find((candidate) => candidate.id === id)
    if (!preset) throw new Error('AI配置预设无效。')
    return preset
  }

  private async savedCredential(metadata: Metadata, id: string) {
    const encrypted = this.store.readKey(id, metadata)
    const preset = this.preset(id)
    try {
      if (!(await this.encryption.available())) throw new Error()
      const key = await this.encryption.decrypt(encrypted)
      return { preset, key }
    } catch {
      throw new Error('无法解密API Key，请检查系统加密或重新保存Key。')
    }
  }

  private async verify(preset: Preset, key: string) {
    await this.send(
      preset,
      key,
      [{ role: 'user', content: aiDefaults.testPrompt }],
      aiDefaults.testMaxTokens
    )
  }

  private async send(
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
        choices?: { finish_reason?: string; message?: { content?: string } }[]
      }
      const choice = result?.choices?.[0]
      const content = choice?.message?.content
      if (choice?.finish_reason !== 'stop' || typeof content !== 'string' || !content.trim())
        throw new Error()
      return content
    } catch {
      throw requestError('AI服务返回了无效或不完整的响应。')
    }
  }
}

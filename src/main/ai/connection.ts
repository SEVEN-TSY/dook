import { randomUUID } from 'node:crypto'
import type { AiConfigurationInput, AiPreset, AiSettings } from '../../shared/ai-settings'
import { AI_CONFIGURATION_NAME_LIMIT } from '../../shared/ai-settings'
import { readAiUsage } from '../storage/ai-call-log'
import type { AiCallEntry, AiCallLog, AiCompletionEvent } from '../storage/ai-call-log'
import { AiSettingsStore } from '../storage/ai-settings'
import { aiDefaults } from './defaults'

const RETRY_DELAYS: readonly number[] = [800, 2_000]
const RETRY_BUDGET_MS = 90_000
const RETRY_AFTER_LIMIT_MS = 5_000
const RETRY_JITTER = 0.2
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504])

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

export interface AiRequestPolicy {
  /** 单次尝试的超时，包含建立连接、等待响应头和读取正文。 */
  timeoutMs?: number
  /** 每次失败后的等待毫秒数，数组长度即自动重试次数；空数组关闭自动重试。 */
  retryDelays?: readonly number[]
}

type AttemptFailure = {
  ok: false
  message: string
  retryable: boolean
  status?: number
  retryAfterMs?: number
  timedOut?: boolean
}

type AttemptResult =
  | { ok: true; content: string; status: number; usage?: ReturnType<typeof readAiUsage> }
  | AttemptFailure

type Preset = AiPreset & { endpoint: string }
type Metadata = ReturnType<AiSettingsStore['load']>

export class AiConnection {
  private readonly store: AiSettingsStore
  private readonly timeoutMs: number
  private readonly retryDelays: readonly number[]
  private pendingSave = Promise.resolve()

  constructor(
    directory: string,
    private readonly encryption: Encryption,
    private readonly callLog: AiCallLog,
    private readonly request: typeof fetch = fetch,
    private readonly onCallLogged: () => void = () => {},
    policy: AiRequestPolicy = {}
  ) {
    this.store = new AiSettingsStore(directory)
    this.timeoutMs = policy.timeoutMs ?? aiDefaults.timeoutMs
    this.retryDelays = policy.retryDelays ?? RETRY_DELAYS
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
    const calledAt = new Date().toISOString()
    const started = performance.now()
    let httpStatus: number | undefined
    let usage: AiCallEntry['usage']
    let outcome: AiCallEntry['outcome'] = 'error'
    let timedOut = false
    try {
      for (let attempt = 0; ; attempt++) {
        const result = await this.attempt(preset, key, messages, maxTokens, options)
        if (result.status !== undefined) httpStatus = result.status
        if (result.ok) {
          usage = result.usage
          outcome = 'success'
          return result.content
        }
        const delay = this.retryDelays[attempt]
        if (
          result.retryable &&
          delay !== undefined &&
          !options.signal?.aborted &&
          performance.now() - started < RETRY_BUDGET_MS
        ) {
          await this.pause(delay, result.retryAfterMs, options.signal)
          continue
        }
        timedOut = result.timedOut === true
        throw new Error(
          attempt > 0 ? `${result.message}（已自动重试${attempt}次）` : result.message
        )
      }
    } finally {
      if (outcome !== 'success') {
        if (options.signal?.aborted) outcome = 'cancelled'
        else if (timedOut) outcome = 'timeout'
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

  /** 发出一次请求，把可重试的失败作为结果返回，只有用户取消才抛出。 */
  private async attempt(
    preset: Preset,
    key: string,
    messages: Message[],
    maxTokens: number,
    options: CompletionOptions
  ): Promise<AttemptResult> {
    if (options.signal?.aborted) throw new Error('请求已取消。')
    const timeout = AbortSignal.timeout(this.timeoutMs)
    const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout
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
    } catch (error) {
      if (options.signal?.aborted) throw new Error('请求已取消。')
      if (timeout.aborted) return timeoutFailure()
      return { ok: false, ...connectionFailure(error) }
    }

    if (!response.ok) {
      void response.body?.cancel().catch(() => {})
      return httpFailure(response.status, response.headers.get('retry-after'))
    }

    try {
      const result = (await response.json()) as {
        usage?: unknown
        choices?: { finish_reason?: string; message?: { content?: string } }[]
      }
      const usage = readAiUsage(result?.usage)
      const choice = result?.choices?.[0]
      const content = choice?.message?.content
      if (choice?.finish_reason !== 'stop' || typeof content !== 'string' || !content.trim())
        throw new Error()
      return { ok: true, content, status: response.status, usage }
    } catch {
      if (timeout.aborted) return timeoutFailure()
      return {
        ok: false,
        status: response.status,
        retryable: false,
        message: 'AI服务返回了无效或不完整的响应，请稍后重试。'
      }
    }
  }

  /** 指数退避等待，同时尊重服务端 Retry-After 和用户取消。 */
  private async pause(
    delayMs: number,
    retryAfterMs: number | undefined,
    signal: AbortSignal | undefined
  ) {
    const base = Math.max(delayMs, Math.min(retryAfterMs ?? 0, RETRY_AFTER_LIMIT_MS))
    const wait = base > 0 ? Math.round(base * (1 + (Math.random() * 2 - 1) * RETRY_JITTER)) : 0
    if (signal?.aborted) throw new Error('请求已取消。')
    if (wait <= 0) return
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort)
        resolve()
      }, wait)
      const abort = () => {
        clearTimeout(timer)
        reject(new Error('请求已取消。'))
      }
      signal?.addEventListener('abort', abort, { once: true })
    })
  }
}

function timeoutFailure(): AttemptFailure {
  return {
    ok: false,
    retryable: true,
    timedOut: true,
    message: 'AI服务请求超时，请稍后重试。'
  }
}

function httpFailure(status: number, retryAfter: string | null): AttemptFailure {
  const retryable = RETRYABLE_STATUSES.has(status)
  const retryAfterMs = retryable ? parseRetryAfter(retryAfter) : undefined
  const failure = (message: string, canRetry = retryable): AttemptFailure => ({
    ok: false,
    status,
    retryable: canRetry,
    message,
    retryAfterMs
  })
  switch (status) {
    case 401:
    case 403:
      return failure('AI服务鉴权失败，请检查API Key。', false)
    case 402:
      return failure('AI服务账户余额不足。', false)
    case 408:
      return failure('AI服务响应超时，请稍后重试。')
    case 429:
      return failure('AI服务请求被限流，请稍后重试。')
    case 500:
    case 502:
    case 503:
    case 504:
      return failure('AI服务暂时不可用，请稍后重试。')
    default:
      return failure('AI服务请求失败，请稍后重试。')
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value.trim())
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(value)
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}

/** 把 fetch 抛出的底层错误转换成可执行的网络提示。 */
function connectionFailure(error: unknown): { message: string; retryable: boolean } {
  switch (errorCode(error)) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return { message: '无法解析AI服务地址，请检查网络连接或代理设置。', retryable: true }
    case 'ENETDOWN':
    case 'ENETUNREACH':
    case 'EHOSTUNREACH':
      return { message: '当前没有可用的网络连接，请检查网络设置。', retryable: true }
    case 'ECONNREFUSED':
      return { message: '无法连接AI服务，请检查网络或代理设置。', retryable: true }
    case 'ECONNRESET':
    case 'EPIPE':
    case 'UND_ERR_SOCKET':
    case 'UND_ERR_CLOSED':
      return { message: 'AI服务连接中断，请稍后重试。', retryable: true }
    case 'ETIMEDOUT':
    case 'UND_ERR_CONNECT_TIMEOUT':
    case 'UND_ERR_HEADERS_TIMEOUT':
    case 'UND_ERR_BODY_TIMEOUT':
      return { message: '连接AI服务超时，请检查网络。', retryable: true }
    case 'CERT_HAS_EXPIRED':
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return { message: 'AI服务证书校验失败，请检查代理设置或系统时间。', retryable: false }
    default:
      return { message: '无法连接AI服务，请检查网络。', retryable: true }
  }
}

/** 读取错误本身或 cause 链上的 Node、undici 错误码。 */
function errorCode(error: unknown): string | undefined {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    const code = (current as { code?: unknown }).code
    if (typeof code === 'string') return code
    current = (current as { cause?: unknown }).cause
  }
  return undefined
}

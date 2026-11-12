import { readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'

const DEEPSEEK_MODEL = 'deepseek-flash'

interface Encryption {
  available(): Promise<boolean>
  encrypt(key: string): Promise<Buffer>
  decrypt(bytes: Buffer): Promise<string>
}

export class DeepSeekConnection {
  private pendingUpdate = Promise.resolve()

  constructor(
    private readonly path: string,
    private readonly encryption: Encryption,
    private readonly request: typeof fetch = fetch
  ) {}

  isConfigured(): boolean {
    try {
      return statSync(this.path, { throwIfNoEntry: false })?.isFile() ?? false
    } catch {
      throw new Error('无法读取DeepSeek配置状态。')
    }
  }

  save(value: string): Promise<void> {
    return this.updateCredential(() => this.writeKey(value))
  }

  private async writeKey(value: string): Promise<void> {
    const key = value.trim()
    if (!/^[!-~]{1,1024}$/.test(key)) throw new Error('请输入有效的DeepSeek API Key。')

    let encrypted: Buffer
    try {
      if (!(await this.encryption.available())) throw new Error()
      encrypted = await this.encryption.encrypt(key)
    } catch {
      throw new Error('系统加密不可用，无法保存DeepSeek API Key。')
    }

    try {
      writeFileSync(`${this.path}.tmp`, encrypted, { mode: 0o600 })
      renameSync(`${this.path}.tmp`, this.path)
    } catch {
      throw new Error('无法保存DeepSeek API Key。')
    }
  }

  clear(): Promise<void> {
    return this.updateCredential(() => {
      try {
        rmSync(`${this.path}.tmp`, { force: true })
        rmSync(this.path, { force: true })
      } catch {
        throw new Error('无法清除DeepSeek API Key。')
      }
    })
  }

  private updateCredential(update: () => void | Promise<void>): Promise<void> {
    const result = this.pendingUpdate.then(update)
    this.pendingUpdate = result.catch(() => {})
    return result
  }

  async test(): Promise<void> {
    if (!this.isConfigured()) throw new Error('请先配置DeepSeek API Key。')
    let key: string
    try {
      const encrypted = readFileSync(this.path)
      if (!(await this.encryption.available())) throw new Error()
      key = await this.encryption.decrypt(encrypted)
    } catch {
      throw new Error('无法解密DeepSeek API Key，请检查系统加密或重新保存Key。')
    }

    const signal = AbortSignal.timeout(60_000)
    let response: Response
    try {
      response = await this.request('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        redirect: 'error',
        signal,
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [{ role: 'user', content: 'Reply OK.' }],
          thinking: { type: 'disabled' },
          stream: false,
          max_tokens: 8
        })
      })
    } catch {
      throw new Error(signal.aborted ? 'DeepSeek连接测试超时。' : '无法连接DeepSeek，请检查网络。')
    }

    if (!response.ok) {
      void response.body?.cancel().catch(() => {})
      switch (response.status) {
        case 401:
        case 403:
          throw new Error('DeepSeek鉴权失败，请检查API Key。')
        case 402:
          throw new Error('DeepSeek账户余额不足。')
        case 429:
          throw new Error('DeepSeek请求被限流，请稍后重试。')
        default:
          throw new Error('DeepSeek服务请求失败，请稍后重试。')
      }
    }

    try {
      const result = (await response.json()) as {
        choices?: { finish_reason?: string; message?: { content?: string } }[]
      }
      const choice = result?.choices?.[0]
      if (choice?.finish_reason !== 'stop' || !choice.message?.content?.trim()) throw new Error()
    } catch {
      throw new Error(signal.aborted ? 'DeepSeek连接测试超时。' : 'DeepSeek返回了无效的响应。')
    }
  }
}

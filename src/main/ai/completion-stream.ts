import { createParser } from 'eventsource-parser'
import type { AiStreamPhase } from '../../shared/ai-settings'

interface CompletionChunk {
  choices?: {
    delta?: { reasoning_content?: string | null; content?: string | null }
    finish_reason?: string | null
  }[]
  usage?: unknown
  error?: unknown
}

export async function readCompletionStream(
  response: Response,
  signal: AbortSignal,
  onPhase: (phase: AiStreamPhase) => void,
  limit = 1024 * 1024
) {
  if (!response.body) throw new Error('响应缺少正文。')
  const reader = response.body.getReader()
  const cancel = () => void reader.cancel().catch(() => {})
  signal.addEventListener('abort', cancel, { once: true })
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let finished = false
  let phase: AiStreamPhase = 'waiting'
  let content = ''
  let finishReason: string | null = null
  let usage: unknown
  const parser = createParser({
    onEvent: ({ data }) => {
      if (finished) return
      if (data === '[DONE]') {
        finished = true
        return
      }
      const chunk = JSON.parse(data) as CompletionChunk
      if (!chunk || chunk.error) throw new Error('AI服务返回了流式错误。')
      if (chunk.usage != null) usage = chunk.usage
      const choice = chunk.choices?.[0]
      if (!choice) return
      if (choice.finish_reason != null) finishReason = choice.finish_reason
      const delta = choice.delta
      if (typeof delta?.content === 'string' && delta.content) {
        content += delta.content
        if (phase !== 'generating') {
          phase = 'generating'
          onPhase(phase)
        }
      } else if (
        phase === 'waiting' &&
        typeof delta?.reasoning_content === 'string' &&
        delta.reasoning_content
      ) {
        phase = 'reasoning'
        onPhase(phase)
      }
    }
  })
  try {
    signal.throwIfAborted()
    while (!finished) {
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      if (done) throw new Error('AI服务响应流提前结束。')
      bytes += value.byteLength
      if (bytes > limit) throw new Error('响应正文超出大小限制。')
      parser.feed(decoder.decode(value, { stream: true }))
    }
    return { content, finishReason, usage }
  } finally {
    signal.removeEventListener('abort', cancel)
    cancel()
    reader.releaseLock()
  }
}

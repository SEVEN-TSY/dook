import type { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { SAVE_REQUEST } from '../../shared/channels'
import type { DailyReportEdits, WindowSaveResult } from '../../shared/daily-report'

/** 隐藏、退出与渲染输入之间的握手；回复只能由原窗口确认。 */
export class SaveBarrier {
  private readonly waiting = new Map<
    string,
    { window: BrowserWindow; finish: (ok: WindowSaveResult) => void }
  >()
  private readonly pending = new Map<BrowserWindow, Promise<boolean>>()

  flush(window: BrowserWindow): Promise<boolean> {
    const existing = this.pending.get(window)
    if (existing) return existing
    const result = this.request(window)
      .then((result) => result === true)
      .finally(() => this.pending.delete(window))
    this.pending.set(window, result)
    return result
  }

  flushReport(
    window: BrowserWindow,
    edits: DailyReportEdits,
    signal: AbortSignal
  ): Promise<WindowSaveResult> {
    return this.request(window, edits, signal)
  }

  private request(
    window: BrowserWindow,
    edits?: DailyReportEdits,
    signal?: AbortSignal
  ): Promise<WindowSaveResult> {
    if (window.isDestroyed() || signal?.aborted) return Promise.resolve(false)
    const id = randomUUID()
    return new Promise<WindowSaveResult>((resolve) => {
      const finish = (ok: WindowSaveResult) => {
        clearTimeout(timeout)
        window.removeListener('closed', closed)
        signal?.removeEventListener('abort', closed)
        this.waiting.delete(id)
        resolve(ok)
      }
      const closed = () => finish(false)
      const timeout = setTimeout(() => finish(false), 10_000)
      this.waiting.set(id, { window, finish })
      window.once('closed', closed)
      signal?.addEventListener('abort', closed, { once: true })
      try {
        window.webContents.send(SAVE_REQUEST, id, edits)
      } catch {
        finish(false)
      }
    })
  }

  reply(window: BrowserWindow, id: string, success: WindowSaveResult): void {
    const request = this.waiting.get(id)
    if (request?.window === window) request.finish(success)
  }
}

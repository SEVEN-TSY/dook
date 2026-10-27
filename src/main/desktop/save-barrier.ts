import type { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { SAVE_REQUEST } from '../../shared/channels'

/** 隐藏、退出与渲染输入之间的握手；回复只能由原窗口确认。 */
export class SaveBarrier {
  private readonly waiting = new Map<
    string,
    { window: BrowserWindow; finish: (ok: boolean) => void }
  >()
  private readonly pending = new Map<BrowserWindow, Promise<boolean>>()

  flush(window: BrowserWindow): Promise<boolean> {
    const existing = this.pending.get(window)
    if (existing) return existing
    if (window.isDestroyed()) return Promise.resolve(false)
    const id = randomUUID()
    const result = new Promise<boolean>((resolve) => {
      const finish = (ok: boolean) => {
        clearTimeout(timeout)
        window.removeListener('closed', closed)
        this.waiting.delete(id)
        resolve(ok)
      }
      const closed = () => finish(false)
      const timeout = setTimeout(() => finish(false), 10_000)
      this.waiting.set(id, { window, finish })
      window.once('closed', closed)
      window.webContents.send(SAVE_REQUEST, id)
    }).finally(() => this.pending.delete(window))
    this.pending.set(window, result)
    return result
  }

  reply(window: BrowserWindow, id: string, success: boolean): void {
    const request = this.waiting.get(id)
    if (request?.window === window) request.finish(success)
  }
}

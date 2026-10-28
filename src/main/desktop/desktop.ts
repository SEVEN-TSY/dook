import { dialog, Menu, nativeImage, Tray } from 'electron'
import type { BrowserWindow } from 'electron'
import type { DesktopState, MainPage, WindowKind } from '../../shared/contracts'
import { WINDOW_STATE } from '../../shared/channels'
import { createWindow, loadWindow } from './window'
import { NoteController } from './note-controller'
import { SaveBarrier } from './save-barrier'

function trayImage() {
  const pixels = Buffer.alloc(16 * 16 * 4)
  for (let y = 1; y < 15; y++)
    for (let x = 1; x < 15; x++) {
      const offset = (y * 16 + x) * 4
      pixels.set([196, 111, 82, 255], offset)
      if (
        (x >= 4 && x <= 7 && Math.abs(y - x - 3) <= 1) ||
        (x >= 7 && x <= 12 && Math.abs(y + x - 17) <= 1)
      )
        pixels.set([255, 255, 255, 255], offset)
    }
  return nativeImage.createFromBitmap(pixels, { width: 16, height: 16 })
}

/** 窗口与托盘的唯一所有者；任务规则仍交给共享应用服务。 */
export class Desktop {
  readonly windows = new Map<WindowKind, BrowserWindow>()
  readonly saves = new SaveBarrier()
  private readonly loading = new Map<WindowKind, Promise<void>>()
  private readonly hiding = new Map<BrowserWindow, Promise<void>>()
  private readonly visibleIntent = new Map<BrowserWindow, boolean>()
  private tray?: Tray
  private note?: NoteController
  private exiting = false
  private preparingQuit = false
  private mainNavigation: DesktopState['mainNavigation']

  constructor(
    private readonly directory: string,
    private readonly quit: () => void
  ) {}

  startTray() {
    if (this.tray) return
    this.tray = new Tray(trayImage())
    this.tray.setToolTip('myTodo')
    this.tray.on('click', () => {
      void this.openWindow('note')
    })
    const menu = Menu.buildFromTemplate([
      {
        label: '打开主界面',
        click: () => {
          void this.openWindow('main')
        }
      },
      {
        label: '隐藏桌面便签',
        click: () => {
          const window = this.windows.get('note')
          if (window) void this.hide(window)
        }
      },
      { type: 'separator' },
      { label: '退出', click: this.quit }
    ])
    menu.on('menu-will-show', () => this.note?.setMenuOpen(true))
    menu.on('menu-will-close', () => this.note?.setMenuOpen(false))
    this.tray.setContextMenu(menu)
  }

  async openWindow(kind: WindowKind, page?: MainPage): Promise<void> {
    if (this.exiting || this.preparingQuit) return
    if (kind === 'main' && page)
      this.mainNavigation = { page, revision: (this.mainNavigation?.revision ?? 0) + 1 }
    let window = this.windows.get(kind)
    if (!window || window.isDestroyed()) {
      window = createWindow(kind)
      this.windows.set(kind, window)
      if (kind === 'note')
        this.note = new NoteController(window, this.directory, () => this.broadcast())
      const current = window
      window.on('close', (event) => {
        if (this.exiting) return
        event.preventDefault()
        void this.hide(current)
      })
      window.on('minimize', () => {
        if (kind === 'main' && !this.exiting) void this.hide(current)
      })
      window.on('closed', () => {
        this.windows.delete(kind)
        this.visibleIntent.delete(current)
      })
      this.loading.set(
        kind,
        loadWindow(window, kind).finally(() => this.loading.delete(kind))
      )
    }
    this.visibleIntent.set(window, true)
    await this.loading.get(kind)
    if (
      window.isDestroyed() ||
      this.exiting ||
      this.preparingQuit ||
      !this.visibleIntent.get(window)
    )
      return
    if (kind === 'note') this.note?.show()
    else {
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
      if (page) this.broadcast()
    }
  }

  state() {
    if (!this.note) throw new Error('桌面便签尚未就绪。')
    return {
      ...this.note.state(),
      exitPending: this.preparingQuit,
      mainNavigation: this.mainNavigation
    }
  }

  private broadcast() {
    if (!this.note) return
    for (const window of this.windows.values())
      if (!window.isDestroyed()) window.webContents.send(WINDOW_STATE, this.state())
  }

  updateSettings(settings: Parameters<NoteController['updateSettings']>[0]) {
    this.note?.updateSettings(settings)
  }
  togglePin(window: BrowserWindow) {
    if (window === this.windows.get('note')) this.note?.togglePin()
  }
  setInteraction(window: BrowserWindow, active: boolean) {
    if (window === this.windows.get('note')) this.note?.setInteraction(active)
  }
  setNoteDragging(window: BrowserWindow, active: boolean) {
    if (!this.preparingQuit && !this.exiting && window === this.windows.get('note'))
      return this.note?.setDragging(active) ?? false
    return false
  }
  finishNoteMotion(window: BrowserWindow, revision: number) {
    if (window === this.windows.get('note')) this.note?.finishNoteMotion(revision)
  }

  async protect<T>(action: () => Promise<T>): Promise<T> {
    return this.note ? this.note.protect(action) : action()
  }

  hide(window: BrowserWindow): Promise<void> {
    if (this.preparingQuit || this.exiting) return Promise.resolve()
    this.visibleIntent.set(window, false)
    const existing = this.hiding.get(window)
    if (existing) return existing
    const result = this.protect(async () => {
      if (!(await this.saves.flush(window))) {
        await this.restoreFailedSave(window)
        return
      }
      if (this.exiting || window.isDestroyed() || this.visibleIntent.get(window)) return
      if (window === this.windows.get('note')) this.note?.hide()
      else window.hide()
    }).finally(() => this.hiding.delete(window))
    this.hiding.set(window, result)
    return result
  }

  private async restoreFailedSave(window: BrowserWindow) {
    if (window.isDestroyed()) return
    if (window === this.windows.get('note')) this.note?.show()
    else {
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
    }
    await dialog.showMessageBox(window, {
      type: 'error',
      message: '输入尚未保存，窗口已保留。请检查输入后重试。',
      buttons: ['返回编辑']
    })
  }

  async prepareQuit(): Promise<boolean> {
    this.note?.setDragging(false)
    this.preparingQuit = true
    this.broadcast()
    await Promise.all(this.loading.values())
    const results = await this.protect(() =>
      Promise.all(
        [...this.windows.values()].map(async (window) => ({
          window,
          ok: await this.saves.flush(window)
        }))
      )
    )
    const failed = results.find((result) => !result.ok)
    if (failed) {
      this.preparingQuit = false
      this.broadcast()
      await this.restoreFailedSave(failed.window)
      return false
    }
    this.exiting = true
    return true
  }

  dispose() {
    this.note?.dispose()
    this.tray?.destroy()
  }
}

import { BrowserWindow, screen } from 'electron'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'
import type { WindowKind } from '../../shared/contracts'

export function createWindow(kind: WindowKind, dataDirectory: string): BrowserWindow {
  const directory = dirname(fileURLToPath(import.meta.url))
  const note = kind === 'note'
  const positionPath = resolve(dataDirectory, 'note-position.json')
  const area = screen.getPrimaryDisplay().workArea
  let position = { x: area.x + area.width - 354, y: area.y + 40 }
  if (note) {
    try {
      const saved: unknown = JSON.parse(readFileSync(positionPath, 'utf8'))
      if (
        saved &&
        typeof saved === 'object' &&
        'x' in saved &&
        'y' in saved &&
        Number.isInteger(saved.x) &&
        Number.isInteger(saved.y)
      ) {
        const point = saved as { x: number; y: number }
        const display = screen.getDisplayNearestPoint(point).workArea
        position = {
          x: Math.max(display.x, Math.min(point.x, display.x + display.width - 334)),
          y: Math.max(display.y, Math.min(point.y, display.y + display.height - 200))
        }
      }
    } catch {
      /* 首次启动或无效位置使用默认值。 */
    }
  }
  const window = new BrowserWindow({
    width: note ? 334 : 1000,
    height: note ? 480 : 760,
    minWidth: note ? 334 : 680,
    minHeight: note ? 260 : 480,
    ...(note ? position : {}),
    title: note ? 'myTodo · 桌面便签' : 'myTodo',
    alwaysOnTop: note,
    backgroundColor: '#FAFBFE',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: resolve(directory, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.once('ready-to-show', () => window.show())
  if (note) {
    const save = () => {
      if (window.isDestroyed() || window.isMinimized()) return
      const [x, y] = window.getPosition()
      try {
        writeFileSync(positionPath, JSON.stringify({ x, y }))
      } catch (error) {
        console.error('保存便签位置失败：', error)
      }
    }
    window.on('moved', save)
    window.on('close', save)
  }
  return window
}

export async function loadWindow(window: BrowserWindow, kind: WindowKind): Promise<void> {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    const url = new URL(devUrl)
    url.searchParams.set('window', kind)
    await window.loadURL(url.toString())
  } else {
    const directory = dirname(fileURLToPath(import.meta.url))
    await window.loadFile(resolve(directory, '../renderer/index.html'), { query: { window: kind } })
  }
}

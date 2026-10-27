import { BrowserWindow } from 'electron'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WindowKind } from '../../shared/contracts'

export function createWindow(kind: WindowKind): BrowserWindow {
  const directory = dirname(fileURLToPath(import.meta.url))
  const note = kind === 'note'
  const window = new BrowserWindow({
    width: note ? 334 : 1000,
    height: note ? 480 : 760,
    minWidth: note ? 334 : 680,
    minHeight: note ? 260 : 480,
    frame: !note,
    thickFrame: !note,
    skipTaskbar: note,
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
  window.setMenu(null)
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

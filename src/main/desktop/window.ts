import { BrowserWindow } from 'electron'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function createMainWindow(): BrowserWindow {
  const directory = dirname(fileURLToPath(import.meta.url))
  const window = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 860,
    minHeight: 650,
    title: 'myTodo · 工程验证',
    backgroundColor: '#f5f6f8',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: resolve(directory, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.once('ready-to-show', () => window.show())
  return window
}

export async function loadMainWindow(window: BrowserWindow): Promise<void> {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    await window.loadURL(devUrl)
  } else {
    const directory = dirname(fileURLToPath(import.meta.url))
    await window.loadFile(resolve(directory, '../renderer/index.html'))
  }
}

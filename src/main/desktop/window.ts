import { BrowserWindow, nativeTheme } from 'electron'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WindowKind } from '../../shared/contracts'
import { appIcon } from './brand'

export function mainWindowTitleBar() {
  return {
    color: '#00000000',
    symbolColor: nativeTheme.shouldUseDarkColors ? '#e3e3e3' : '#303744',
    height: 32
  }
}

export function createWindow(kind: WindowKind): BrowserWindow {
  const directory = dirname(fileURLToPath(import.meta.url))
  const note = kind === 'note'
  const window = new BrowserWindow({
    width: note ? 334 : 1000,
    height: note ? 480 : 760,
    minWidth: note ? 334 : 680,
    minHeight: note ? 260 : 480,
    frame: !note,
    titleBarStyle: note ? 'default' : 'hidden',
    titleBarOverlay: note ? false : mainWindowTitleBar(),
    thickFrame: !note,
    transparent: note,
    skipTaskbar: note,
    title: note ? 'DOOK · 桌面便签' : 'DOOK',
    icon: appIcon(),
    alwaysOnTop: note,
    backgroundColor: note ? '#00000000' : nativeTheme.shouldUseDarkColors ? '#202020' : '#FAFBFE',
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

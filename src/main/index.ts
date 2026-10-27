import { app, dialog } from 'electron'
import { resolve } from 'node:path'
import type { McpStatus } from '../shared/contracts'
import { AppDatabase } from './storage/database'
import { AppService } from './core/app-service'
import { createMainWindow, loadMainWindow } from './desktop/window'
import { registerIpc } from './desktop/ipc'
import { runDiagnostics } from './desktop/diagnostics'
import { startMcpEndpoint } from './mcp/server'
import type { McpEndpoint } from './mcp/server'
import { loadOrCreateToken } from './mcp/token'

app.setName('myTodo')
app.setAppUserModelId('com.mytodo.desktop')
const dataDirectory = resolve(
  process.env.MYTODO_DATA_DIR ||
    resolve(app.getPath('appData'), app.isPackaged ? 'myTodo' : 'myTodo-development')
)
app.setPath('userData', dataDirectory)

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void app
    .whenReady()
    .then(async () => {
      const database = new AppDatabase(resolve(dataDirectory, 'mytodo.sqlite'))
      const service = new AppService(database)
      let endpoint: McpEndpoint | undefined
      let token = ''
      let mcp: McpStatus = { state: 'unavailable', endpoint: null, error: null }
      let disposeIpc = () => {}
      let quitting = false
      app.on('before-quit', (event) => {
        if (quitting) return
        quitting = true
        event.preventDefault()
        disposeIpc()
        void (async () => {
          try {
            await endpoint?.close()
          } finally {
            database.close()
            app.quit()
          }
        })().catch((error) => {
          console.error('退出清理失败：', error)
          app.exit(1)
        })
      })

      try {
        token = loadOrCreateToken(resolve(dataDirectory, 'mcp-token'))
        const port = Number(process.env.MYTODO_MCP_PORT ?? 32145)
        if (!Number.isInteger(port) || port < 0 || port > 65535)
          throw new Error('MYTODO_MCP_PORT必须为0至65535的整数。')
        endpoint = await startMcpEndpoint({ service, token, port })
        mcp = { state: 'listening', endpoint: endpoint.url, error: null }
      } catch (error) {
        mcp = {
          state: 'unavailable',
          endpoint: null,
          error: error instanceof Error ? error.message : 'MCP启动失败。'
        }
      }

      const window = createMainWindow()
      disposeIpc = registerIpc(window, {
        getBootstrap: () => ({
          runtime: {
            appVersion: app.getVersion(),
            electron: process.versions.electron,
            chrome: process.versions.chrome,
            node: process.versions.node,
            platform: process.platform,
            dataDirectory,
            isPackaged: app.isPackaged
          },
          mcp
        }),
        runDiagnostics: () => runDiagnostics(service, mcp, token)
      })
      app.on('second-instance', () => {
        if (window.isDestroyed()) return
        if (window.isMinimized()) window.restore()
        window.show()
        window.focus()
      })
      await loadMainWindow(window)
    })
    .catch((error) => {
      dialog.showErrorBox('myTodo启动失败', error instanceof Error ? error.message : String(error))
      app.quit()
    })
  app.on('window-all-closed', () => app.quit())
}

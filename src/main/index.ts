import { app, dialog } from 'electron'
import { resolve } from 'node:path'
import type { McpStatus } from '../shared/contracts'
import { TASKS_CHANGED } from '../shared/channels'
import { TaskRepository } from './storage/repositories/tasks'
import { localDate } from './core/tasks'
import { AppDatabase } from './storage/database'
import { AppService } from './core/app-service'
import { Desktop } from './desktop/desktop'
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
      const service = new AppService(database, new TaskRepository(database.connection))
      const desktop = new Desktop(dataDirectory, () => app.quit())
      const windows = desktop.windows
      const changed = () => {
        for (const window of windows.values()) {
          if (!window.isDestroyed()) window.webContents.send(TASKS_CHANGED)
        }
      }
      let date = localDate(new Date())
      const dateTimer = setInterval(() => {
        const next = localDate(new Date())
        if (date !== next) {
          date = next
          changed()
        }
      }, 1000)
      app.on('browser-window-focus', () => changed())
      app.on('will-quit', () => clearInterval(dateTimer))
      let endpoint: McpEndpoint | undefined
      let token = ''
      let mcp: McpStatus = { state: 'unavailable', endpoint: null, error: null }
      let disposeIpc = () => {}
      let quitting = false
      let quitAllowed = false
      app.on('before-quit', (event) => {
        if (quitAllowed) return
        event.preventDefault()
        if (quitting) return
        quitting = true
        void (async () => {
          if (!(await desktop.prepareQuit())) {
            quitting = false
            return
          }
          desktop.dispose()
          disposeIpc()
          try {
            await endpoint?.close()
          } finally {
            database.close()
            quitAllowed = true
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

      disposeIpc = registerIpc({
        desktop,
        windows: () => [...windows.values()],
        service,
        changed,
        openWindow: (kind) => desktop.openWindow(kind),
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
        void desktop.openWindow('note')
      })
      await desktop.openWindow('note')
      desktop.startTray()
    })
    .catch((error) => {
      dialog.showErrorBox('myTodo启动失败', error instanceof Error ? error.message : String(error))
      app.quit()
    })
  app.on('window-all-closed', () => {
    /* 唯一托盘入口维持常驻，由显式退出结束应用。 */
  })
}

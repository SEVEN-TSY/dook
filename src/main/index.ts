import { app, dialog, safeStorage } from 'electron'
import { dirname, resolve } from 'node:path'
import type { McpStatus } from '../shared/contracts'
import { AI_CALL_LOGGED, TASKS_CHANGED } from '../shared/channels'
import type { DailyReportEditKind } from '../shared/daily-report'
import { TaskRepository } from './storage/repositories/tasks'
import { DailyReportRepository } from './storage/repositories/daily-reports'
import { DailyReports } from './core/daily-reports'
import { DailyReportSession } from './desktop/daily-report-session'
import { HabitRepository } from './storage/repositories/habits'
import { InspirationRepository } from './storage/repositories/inspirations'
import { localDate } from './core/tasks'
import { AppDatabase } from './storage/database'
import { AppService } from './core/app-service'
import type { AiConnection } from './ai/connection'
import type { AiScenePrompts } from './ai/scene-prompts'
import { Desktop } from './desktop/desktop'
import { configureLaunchAtLogin } from './desktop/login-item'
import { readPreferences } from './desktop/preferences'
import { registerIpc } from './desktop/ipc'
import type { McpEndpoint } from './mcp/server'
import {
  findMigrationFile,
  prepareDataDirectory,
  readInstalledDataDirectory
} from './storage/data-directory'

const reportEditLabels: Record<DailyReportEditKind, string> = {
  task: '任务描述',
  subitem: '子事项',
  habit: '习惯描述'
}

app.setName('DOOK')
app.setAppUserModelId('com.dook.desktop')
const appData = app.getPath('appData')
const dataOverride = process.env.DOOK_DATA_DIR || process.env.MYTODO_DATA_DIR
const defaultDataDirectory = resolve(appData, app.isPackaged ? 'dook' : 'dook-development')
const installedDataDirectory =
  !dataOverride && app.isPackaged && process.platform === 'win32'
    ? readInstalledDataDirectory(dirname(process.execPath))
    : undefined
const dataDirectory = resolve(dataOverride || installedDataDirectory || defaultDataDirectory)
const formerDataDirectory =
  installedDataDirectory && dataDirectory !== defaultDataDirectory
    ? defaultDataDirectory
    : undefined
const previousDataDirectory = resolve(
  dataOverride || resolve(appData, app.isPackaged ? 'myTodo' : 'myTodo-development')
)
app.setPath('userData', dataDirectory)

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  const migrationSettings =
    !findMigrationFile('dook.sqlite', [dataDirectory]) &&
    findMigrationFile(
      'desktop-settings.json',
      [dataDirectory, formerDataDirectory, previousDataDirectory].filter(
        (directory): directory is string => Boolean(directory)
      )
    )
  const preferencesDirectory = migrationSettings ? dirname(migrationSettings) : dataDirectory
  const startupPreferences = readPreferences(preferencesDirectory)
  if (!startupPreferences.settings.hardwareAcceleration) app.disableHardwareAcceleration()
  // 迁移前后目录一致时复用同一次读取；目录不同时等迁移完成后再读新目录。
  const dataPreferences = preferencesDirectory === dataDirectory ? startupPreferences : undefined
  void app
    .whenReady()
    .then(async () => {
      const database = new AppDatabase(
        await prepareDataDirectory(dataDirectory, previousDataDirectory, formerDataDirectory)
      )
      const preferences = dataPreferences ?? readPreferences(dataDirectory)
      const tasks = new TaskRepository(database.connection)
      const service = new AppService(database, tasks, undefined, {
        habits: new HabitRepository(database.connection),
        inspirations: new InspirationRepository(database.connection)
      })
      service.ensureDailyTasks()
      const setLaunchAtLogin = (enabled: boolean) => configureLaunchAtLogin(app, enabled)
      const desktop = new Desktop(
        dataDirectory,
        () => app.quit(),
        setLaunchAtLogin,
        preferences,
        () => dailyReport.cancel()
      )
      const windows = desktop.windows
      const changed = () => {
        for (const window of windows.values()) {
          if (!window.isDestroyed()) window.webContents.send(TASKS_CHANGED)
        }
      }
      let date = localDate(new Date())
      let checkedMinute = ''
      const dateTimer = setInterval(() => {
        const now = new Date()
        const next = localDate(now)
        const minute = `${next}:${now.getHours()}:${now.getMinutes()}`
        if (checkedMinute !== minute) {
          try {
            const generated = service.ensureDailyTasks()
            checkedMinute = minute
            if (date !== next || generated) changed()
            date = next
          } catch (error) {
            console.error('习惯任务生成失败，稍后重试：', error)
          }
        }
      }, 1000)
      app.on('browser-window-focus', () => changed())
      app.on('will-quit', () => clearInterval(dateTimer))
      let endpoint: McpEndpoint | undefined
      let tokenPromise: Promise<string> | undefined
      let mcp: McpStatus = { state: 'unavailable', endpoint: null, error: null }
      let ai: Promise<AiConnection> | undefined
      let aiPrompts: Promise<AiScenePrompts> | undefined
      let disposeIpc = () => {}
      let quitting = false
      let quitAllowed = false
      // MCP凭证只在端点或诊断真正需要时读取，首帧不再做加密随机数与文件写入。
      const mcpToken = () =>
        (tokenPromise ??= import('./mcp/token').then(({ loadOrCreateToken }) =>
          loadOrCreateToken(resolve(dataDirectory, 'mcp-token'))
        ))
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
            await dailyReport.stop()
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

      // 窗口可见后再启动MCP：SDK与监听都不进入首帧关键路径。
      const startMcp = async () => {
        try {
          const port = Number(process.env.DOOK_MCP_PORT ?? process.env.MYTODO_MCP_PORT ?? 32145)
          if (!Number.isInteger(port) || port < 0 || port > 65535)
            throw new Error('DOOK_MCP_PORT必须为0至65535的整数。')
          const [{ startMcpEndpoint }, token] = await Promise.all([
            import('./mcp/server'),
            mcpToken()
          ])
          endpoint = await startMcpEndpoint({ service, token, port })
          mcp = { state: 'listening', endpoint: endpoint.url, error: null }
        } catch (error) {
          mcp = {
            state: 'unavailable',
            endpoint: null,
            error: error instanceof Error ? error.message : 'MCP启动失败。'
          }
        }
      }

      // AI配置只在设置页真正使用时加载，含zod与调用日志。
      const aiConnection = () =>
        (ai ??= (async () => {
          const [{ AiConnection }, { AiCallLog }] = await Promise.all([
            import('./ai/connection'),
            import('./storage/ai-call-log')
          ])
          return new AiConnection(
            dataDirectory,
            {
              available: async () =>
                (await safeStorage.isAsyncEncryptionAvailable()) &&
                (process.platform !== 'linux' ||
                  safeStorage.getSelectedStorageBackend() !== 'basic_text'),
              encrypt: (key) => safeStorage.encryptStringAsync(key),
              decrypt: async (bytes) => (await safeStorage.decryptStringAsync(bytes)).result
            },
            new AiCallLog(database.connection, dataDirectory),
            undefined,
            () => {
              for (const window of windows.values()) {
                if (!window.webContents.isDestroyed()) window.webContents.send(AI_CALL_LOGGED)
              }
            }
          )
        })())
      const scenePrompts = () =>
        (aiPrompts ??= import('./ai/scene-prompts').then(
          ({ AiScenePrompts }) => new AiScenePrompts(dataDirectory)
        ))
      const dailyReport = new DailyReportSession(
        new DailyReports(tasks, new DailyReportRepository(database.connection)),
        aiConnection,
        scenePrompts,
        () => desktop.state().settings.showMultiDay,
        async (edits, signal) => {
          const results = await Promise.all(
            [...windows.entries()].map(async ([kind, window]) => ({
              kind,
              result: await desktop.saves.flushReport(window, edits, signal)
            }))
          )
          const errors = results.flatMap(({ kind, result }) =>
            result === true
              ? []
              : [
                  `${kind === 'main' ? '主界面' : '桌面便签'}${
                    Array.isArray(result)
                      ? `的${result.map((kind) => reportEditLabels[kind]).join('、')}尚未保存`
                      : '未能确认任务、子事项或习惯编辑已保存'
                  }`
                ]
          )
          if (errors.length) throw new Error(`${errors.join('；')}。请处理相关编辑后重新生成。`)
        }
      )
      disposeIpc = registerIpc({
        ai: aiConnection,
        aiPrompts: scenePrompts,
        dailyReport,
        desktop,
        windows: () => [...windows.values()],
        service,
        changed,
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
        runDiagnostics: async () => {
          const { runDiagnostics } = await import('./desktop/diagnostics')
          return runDiagnostics(service, mcp, await mcpToken())
        }
      })
      app.on('second-instance', () => {
        void desktop.openWindow('note')
      })
      await desktop.openWindow('note')
      desktop.startTray()
      // 登录项在窗口可见后同步，避免注册表写入拖慢首帧。
      try {
        setLaunchAtLogin(preferences.settings.launchAtLogin)
      } catch (error) {
        console.error('更新开机自启设置失败：', error)
      }
      void startMcp()
    })
    .catch((error) => {
      dialog.showErrorBox('DOOK启动失败', error instanceof Error ? error.message : String(error))
      app.quit()
    })
  app.on('window-all-closed', () => {
    /* 唯一托盘入口维持常驻，由显式退出结束应用。 */
  })
}

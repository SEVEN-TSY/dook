import { app, BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, '.local/smoke')
mkdirSync(output, { recursive: true })
process.env.MYTODO_DATA_DIR = resolve(output, 'data')
process.env.MYTODO_MCP_PORT = '0'
app.disableHardwareAcceleration()

const waitFor = async (condition, label) => {
  const deadline = Date.now() + 12_000
  while (Date.now() < deadline) {
    const result = await condition()
    if (result) return result
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error(`等待超时：${label}`)
}

async function runSmoke() {
  try {
    // 导入真正的应用入口，验证组装后的生产构建。
    await import('../out/main/index.js')
    await app.whenReady()
    const window = await waitFor(
      () => BrowserWindow.getAllWindows().find((item) => !item.isDestroyed()),
      '主窗口创建'
    )
    const rendererErrors = []
    window.webContents.on('console-message', (event) => {
      if (event.level === 'error') rendererErrors.push(event.message)
    })
    await waitFor(async () => {
      if (window.webContents.isLoading()) return false
      return window.webContents.executeJavaScript(
        'Boolean(window.myTodo && document.querySelector("[data-testid=run-diagnostics]"))'
      )
    }, 'React与preload加载')
    await waitFor(
      () =>
        window.webContents.executeJavaScript(
          '!document.querySelector("[data-testid=run-diagnostics]").disabled'
        ),
      '启动信息加载'
    )
    await window.webContents.executeJavaScript(
      'document.querySelector("[data-testid=run-diagnostics]").click()'
    )
    await waitFor(
      () =>
        window.webContents.executeJavaScript(
          'document.querySelectorAll("[data-result=passed]").length === 3'
        ),
      '三项真实链路检查通过'
    )
    const state = await window.webContents.executeJavaScript(`(async () => ({
    title: document.title,
    nodeExposed: typeof window.require !== 'undefined' || typeof window.process !== 'undefined',
    bridgeKeys: Object.keys(window.myTodo),
    checks: [...document.querySelectorAll('[data-check]')].map(row => ({ id: row.dataset.check, result: row.dataset.result })),
    bootstrap: await window.myTodo.getBootstrap()
  }))()`)
    assert.equal(state.nodeExposed, false)
    assert.deepEqual(state.bridgeKeys.sort(), ['getBootstrap', 'runDiagnostics'])
    assert.equal(state.bootstrap.ok, true)
    assert.equal(state.checks.length, 3)
    assert.equal(rendererErrors.length, 0, rendererErrors.join('\n'))
    writeFileSync(resolve(output, 'result.json'), JSON.stringify(state, null, 2))
    await window.webContents.executeJavaScript(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
    )
    const image = await window.webContents.capturePage()
    writeFileSync(resolve(output, 'diagnostics.png'), image.toPNG())
    console.log('Electron smoke passed: React / preload / IPC / SQLite / MCP')
    console.log(`Screenshot: ${resolve(output, 'diagnostics.png')}`)
    app.quit()
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
}

// Electron必须先完成入口模块求值，才能触发ready；不要在顶层await app.whenReady()。
void runSmoke()

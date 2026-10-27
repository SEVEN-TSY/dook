import { app, BrowserWindow, dialog } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, '.local/smoke')
mkdirSync(output, { recursive: true })
process.env.MYTODO_DATA_DIR = process.env.MYTODO_SMOKE_DATA
process.env.MYTODO_MCP_PORT = '0'
app.disableHardwareAcceleration()
const phase = process.env.MYTODO_SMOKE_PHASE || 'create'
const waitFor = async (condition, label) => {
  const deadline = Date.now() + 12_000
  while (Date.now() < deadline) {
    const result = await condition()
    if (result) return result
    await new Promise((resolveWait) => setTimeout(resolveWait, 80))
  }
  throw new Error(`等待超时：${label}`)
}
const js = (window, code) => window.webContents.executeJavaScript(code)
const ready = (window) =>
  waitFor(
    async () =>
      !window.webContents.isLoading() &&
      js(window, 'Boolean(document.querySelector("[data-testid=task-new]:not(:disabled)"))'),
    '任务列表就绪'
  )
const rows = (window) =>
  js(
    window,
    `Array.from(document.querySelectorAll('[data-task-id]')).map(row => ({ id: row.dataset.taskId, description: row.querySelector('[data-testid=task-description]')?.textContent, completed: row.querySelector('input[type=checkbox]').checked }))`
  )
const count = (window, n) => waitFor(async () => (await rows(window)).length === n, `任务数量${n}`)
async function input(window, selector, value, key = 'Enter') {
  await waitFor(
    () =>
      js(
        window,
        `Boolean(document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled)`
      ),
    '输入可用'
  )
  await js(
    window,
    `(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`
  )
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: key })
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: key })
  await js(
    window,
    'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
  )
}
const click = (window, selector) =>
  js(window, `document.querySelector(${JSON.stringify(selector)}).click()`)
async function edit(window, value, key = 'Enter') {
  await click(window, '[data-testid=task-description]')
  await waitFor(
    () => js(window, 'Boolean(document.querySelector("[data-testid=task-edit]"))'),
    '行内编辑'
  )
  await input(window, '[data-testid=task-edit]', value, key)
}
async function runSmoke() {
  try {
    await import('../out/main/index.js')
    await app.whenReady()
    await waitFor(() => BrowserWindow.getAllWindows().length === 2, '双窗口')
    let main = BrowserWindow.getAllWindows().find((window) => !window.isAlwaysOnTop())
    let note = BrowserWindow.getAllWindows().find((window) => window.isAlwaysOnTop())
    assert.ok(main && note)
    await Promise.all([ready(main), ready(note)])
    const rendererErrors = []
    for (const window of [main, note])
      window.webContents.on('console-message', (event) => {
        if (event.level === 'error') rendererErrors.push(event.message)
      })
    assert.ok(Math.abs(note.getSize()[0] - 334) <= 4)
    if (phase === 'create') {
      await count(main, 0)
      await input(main, '[data-testid=task-new]', '   ')
      await count(main, 0)
      await input(main, '[data-testid=task-new]', ' 检查构建 ')
      await count(note, 1)
      await input(note, '[data-testid=task-new]', '更新进展')
      await count(main, 2)
      for (const window of [main, note]) {
        const other = window === main ? note : main
        const original = (await rows(window))[0].description
        await edit(window, '取消的修改', 'Escape')
        assert.equal((await rows(window))[0].description, original)
        await edit(window, '   ')
        await waitFor(
          () => js(window, 'Boolean(document.querySelector("[role=alert]"))'),
          '空白描述校验'
        )
        await input(window, '[data-testid=task-edit]', '取消', 'Escape')
        await edit(window, window === main ? ' 主界面已编辑 ' : ' 便签已编辑 ')
        const expected = window === main ? '主界面已编辑' : '便签已编辑'
        await waitFor(async () => (await rows(other))[0].description === expected, '编辑同步')
        await click(window, 'input[type=checkbox]')
        await waitFor(async () => (await rows(other))[0].completed, '完成同步')
        await click(window, 'input[type=checkbox]')
        await waitFor(async () => !(await rows(other))[0].completed, '取消完成同步')
        let confirmations = 0
        dialog.showMessageBox = async () => {
          confirmations++
          return { response: 0, checkboxChecked: false }
        }
        await click(window, '[data-testid=task-delete]')
        await waitFor(() => confirmations === 1, '删除确认取消')
        await count(other, 2)
        await click(other, '[data-testid=task-description]')
        dialog.showMessageBox = async () => {
          confirmations++
          return { response: 1, checkboxChecked: false }
        }
        await click(window, '[data-testid=task-delete]')
        await count(other, 1)
        assert.equal(confirmations, 2)
        assert.equal(
          await js(other, 'Boolean(document.querySelector("[data-testid=task-edit]"))'),
          false
        )
        await input(window, '[data-testid=task-new]', '检查构建')
        await count(other, 2)
      }
      await edit(note, ' 持久化的任务描述 ')
      await waitFor(
        async () => (await rows(main))[0].description === '持久化的任务描述',
        '最终编辑同步'
      )
      await click(note, 'input[type=checkbox]')
      await waitFor(async () => (await rows(main))[0].completed, '最终状态同步')
      note.setPosition(80, 90)
      note.close()
      await waitFor(() => BrowserWindow.getAllWindows().length === 1, '便签关闭后主界面保留')
      await click(main, '[data-testid=open-other]')
      note = await waitFor(
        () => BrowserWindow.getAllWindows().find((window) => window.isAlwaysOnTop()),
        '重开便签'
      )
      await ready(note)
      assert.deepEqual(note.getPosition(), [80, 90])
      await click(main, '[data-testid=open-other]')
      assert.equal(BrowserWindow.getAllWindows().length, 2)
      main.close()
      await waitFor(() => BrowserWindow.getAllWindows().length === 1, '主界面关闭后便签保留')
      await click(note, '[data-testid=open-other]')
      main = await waitFor(
        () => BrowserWindow.getAllWindows().find((window) => !window.isAlwaysOnTop()),
        '重开主界面'
      )
      await ready(main)
      await count(main, 2)
    } else {
      assert.deepEqual(note.getPosition(), [80, 90])
      assert.deepEqual(
        (await rows(main)).map(({ description, completed }) => ({ description, completed })),
        [
          { description: '持久化的任务描述', completed: true },
          { description: '检查构建', completed: false }
        ]
      )
      assert.deepEqual(await rows(main), await rows(note))
    }
    const diagnostics = await js(main, 'window.myTodo.runDiagnostics()')
    assert.equal(diagnostics.ok, true)
    assert.ok(diagnostics.data.checks.every((check) => check.ok))
    assert.equal(await js(main, 'typeof window.require'), 'undefined')
    assert.deepEqual(rendererErrors, [])
    writeFileSync(
      resolve(output, `result-${phase}.json`),
      JSON.stringify({ tasks: await rows(main), diagnostics }, null, 2)
    )
    for (const [name, window] of [
      ['main', main],
      ['note', note]
    ]) {
      await js(
        window,
        'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
      )
      writeFileSync(
        resolve(output, `${name}-${phase}.png`),
        (await window.webContents.capturePage()).toPNG()
      )
    }
    console.log(`Electron smoke passed: ${phase}`)
    main.close()
    note.close()
  } catch (error) {
    console.error(error)
    for (const window of BrowserWindow.getAllWindows())
      console.error(await js(window, 'document.body.innerText'))
    app.exit(1)
  }
}
void runSmoke()

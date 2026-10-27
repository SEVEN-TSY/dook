import { subitemsSmoke } from './subitems-smoke.mjs'
import { habitsSmoke } from './smoke-habits.mjs'
import { app, BrowserWindow, dialog, Tray, screen } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { inspirationSmoke } from './inspiration-smoke.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, '.local/smoke')
mkdirSync(output, { recursive: true })
process.env.MYTODO_DATA_DIR = process.env.MYTODO_SMOKE_DATA
process.env.MYTODO_MCP_PORT = '0'
app.disableHardwareAcceleration()
const phase = process.env.MYTODO_SMOKE_PHASE || 'create'
const trays = new Set()
let trayMenu
const setContextMenu = Tray.prototype.setContextMenu
Tray.prototype.setContextMenu = function (menu) {
  trays.add(this)
  trayMenu = menu
  return setContextMenu.call(this, menu)
}
const findWindow = (kind) =>
  BrowserWindow.getAllWindows().find((window) =>
    window.webContents.getURL().includes(`window=${kind}`)
  )
const trayClick = () => [...trays][0].emit('click')
const menuClick = (label) => trayMenu.items.find((item) => item.label === label).click()
const state = async (window) => (await js(window, 'window.myTodo.getWindowState()')).data
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
  window.focus()
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
  if (key === 'outside-click') {
    await js(
      window,
      `document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))`
    )
    await js(
      window,
      `document.querySelector('.task-list').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0 }))`
    )
  } else if (key) {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: key })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: key })
  }
  await js(
    window,
    'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
  )
}
const click = async (window, selector) => {
  await waitFor(
    () =>
      js(
        window,
        `(() => { const element = document.querySelector(${JSON.stringify(selector)}); return element && !element.disabled && element.getClientRects().length > 0 })()`
      ),
    `控件可操作：${selector}`
  )
  window.focus()
  return js(window, `document.querySelector(${JSON.stringify(selector)}).click()`)
}
async function edit(window, value, key = 'Enter') {
  await click(window, '[data-testid=task-description]')
  await waitFor(
    () => js(window, 'Boolean(document.querySelector("[data-testid=task-edit]"))'),
    '行内编辑'
  )
  await input(window, '[data-testid=task-edit]', value, key)
}

async function draggingSmoke(note) {
  const cursor = screen.getCursorScreenPoint
  const before = note.getBounds()
  const size = note.getContentSize()
  let point = { x: before.x + 80, y: before.y + 25 }
  screen.getCursorScreenPoint = () => point
  try {
    note.focus()
    note.webContents.sendInputEvent({
      type: 'mouseDown',
      x: 80,
      y: 25,
      button: 'left',
      clickCount: 1
    })
    await new Promise((resolve) => setTimeout(resolve, 80))
    for (let step = 1; step <= 19; step++) {
      point = { x: before.x + 80 + step, y: before.y + 25 + step }
      await waitFor(() => note.getBounds().x === before.x + step, '连续拖动跟随鼠标')
      assert.deepEqual(note.getContentSize(), size, `第${step}次移动内容尺寸不变`)
    }
    note.webContents.sendInputEvent({
      type: 'mouseUp',
      x: 80,
      y: 25,
      button: 'left',
      clickCount: 1
    })
    await new Promise((resolve) => setTimeout(resolve, 80))
    assert.deepEqual(note.getContentSize(), size, '拖动结束内容尺寸不变')
  } finally {
    await js(note, 'window.myTodo.setNoteDragging(false)')
    screen.getCursorScreenPoint = cursor
  }
}

async function dockingSmoke(main, note) {
  const display = screen.getPrimaryDisplay()
  const area = display.workArea
  const original = {
    cursor: screen.getCursorScreenPoint,
    all: screen.getAllDisplays,
    matching: screen.getDisplayMatching
  }
  let pointer = { x: area.x + area.width / 2, y: area.y + area.height / 2 }
  screen.getCursorScreenPoint = () => pointer
  const pause = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms))
  const move = async (x, y) => {
    note.setPosition(Math.round(x), Math.round(y))
    // 程序移动不会产生Windows的用户拖动完成事件，模拟该操作系统边界。
    note.emit('moved')
    await pause(100)
  }
  try {
    await js(note, 'document.activeElement?.blur()')
    await draggingSmoke(note)
    const beforeDrag = note.getBounds()
    pointer = { x: beforeDrag.x + 80, y: beforeDrag.y + 25 }
    note.webContents.sendInputEvent({
      type: 'mouseDown',
      x: 80,
      y: 25,
      button: 'left',
      clickCount: 1
    })
    await pause(100)
    pointer = { x: pointer.x + 40, y: pointer.y + 30 }
    await waitFor(() => note.getBounds().x === beforeDrag.x + 40, '头部拖动跟随鼠标')
    note.webContents.sendInputEvent({
      type: 'mouseUp',
      x: 80,
      y: 25,
      button: 'left',
      clickCount: 1
    })
    await pause(100)
    assert.equal(
      await js(note, `getComputedStyle(document.querySelector('.task-heading')).cursor`),
      'move',
      '四向移动光标'
    )
    if ((await state(note)).pinned) await click(note, '[data-testid=note-pin]')
    await move(area.x + 28, area.y + 100)
    assert.equal((await state(note)).edge, 'left')
    assert.equal(note.isAlwaysOnTop(), true, '贴边强制置顶')
    assert.equal(
      await js(
        note,
        `document.querySelector('[data-testid=note-pin]').getAttribute('aria-pressed')`
      ),
      'true'
    )
    assert.equal(
      await js(note, `getComputedStyle(document.querySelector('[data-testid=note-pin]')).opacity`),
      '1',
      '吸附图钉保持亮起'
    )
    const full = note.getBounds()
    pointer = { x: full.x + 30, y: full.y + 40 }
    await pause(150)
    pointer = { x: area.x + area.width - 40, y: area.y + area.height - 50 }
    await waitFor(async () => (await state(note)).collapsed, '离开后贴边收起')
    assert.equal(note.getBounds().x + note.getBounds().width - area.x, 6, '边缘仅保留6px入口')
    await waitFor(
      () => js(note, 'Boolean(document.querySelector(".edge-handle"))'),
      '细条入口完成渲染'
    )
    await js(
      note,
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
    )
    writeFileSync(resolve(output, 'note-edge.png'), (await note.webContents.capturePage()).toPNG())
    main.focus()
    await waitFor(() => main.isFocused(), '主界面获得焦点')
    const strip = note.getBounds()
    pointer = { x: area.x + 2, y: strip.y + 20 }
    await pause(100)
    assert.equal((await state(note)).collapsed, true, '短暂悬停不会立即展开')
    await waitFor(async () => !(await state(note)).collapsed, '悬停展开')
    assert.equal(main.isFocused(), true, '悬停展开不抢焦点')
    await click(note, '[data-testid=task-description]')
    pointer = { x: area.x + area.width - 40, y: area.y + area.height - 50 }
    await pause(750)
    assert.equal((await state(note)).collapsed, false, '行内编辑保护')
    note.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
    note.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
    await waitFor(
      () => js(note, '!document.querySelector("[data-testid=task-edit]")'),
      '结束行内编辑'
    )
    await js(note, 'document.activeElement?.blur()')
    await waitFor(async () => (await state(note)).collapsed, '编辑结束恢复收起')
    trayClick()
    await waitFor(async () => !(await state(note)).collapsed && note.isFocused(), '托盘展开并聚焦')
    await pause(750)
    assert.equal((await state(note)).collapsed, false, '主动唤出等待进入再离开')
    await click(main, '[data-testid=open-settings]')
    await click(main, '[data-testid=edge-auto-hide]')
    await waitFor(async () => !(await state(note)).settings.edgeAutoHide, '关闭贴边开关')
    assert.equal((await state(note)).edge, null)
    assert.equal(note.isAlwaysOnTop(), false, '解除贴边恢复本次图钉选择')
    await click(main, '[data-testid=edge-auto-hide]')
    await waitFor(async () => (await state(note)).settings.edgeAutoHide, '重新开启贴边开关')
    assert.equal((await state(note)).edge, null, '开启开关不自动吸附')
    await js(main, 'document.querySelector(".back-button").click()')

    // 在真实Electron窗口外侧替换屏幕拓扑，覆盖CI不能实际插拔的系统边界。
    const half = Math.floor(area.width / 2)
    const left = {
      ...display,
      id: 1001,
      bounds: { x: area.x, y: area.y, width: half, height: area.height },
      workArea: { x: area.x, y: area.y, width: half, height: area.height }
    }
    const right = {
      ...display,
      id: 1002,
      bounds: { x: area.x + half, y: area.y, width: area.width - half, height: area.height },
      workArea: { x: area.x + half, y: area.y, width: area.width - half, height: area.height }
    }
    screen.getAllDisplays = () => [left, right]
    screen.getDisplayMatching = (bounds) =>
      bounds.x + bounds.width / 2 < right.bounds.x ? left : right
    await move(right.workArea.x + 5, area.y + 100)
    assert.equal((await state(note)).edge, null, '双屏接缝不吸附')
    await move(area.x + 100, area.y + area.height - note.getSize()[1] - 5)
    assert.equal((await state(note)).edge, null, '底边不吸附')
    await move(area.x + 100, area.y + 5)
    assert.equal((await state(note)).edge, 'top')
    await move(area.x + area.width - note.getSize()[0] - 5, area.y + 100)
    assert.equal((await state(note)).edge, 'right')
    screen.getAllDisplays = () => [left]
    screen.getDisplayMatching = () => left
    await js(note, 'window.myTodo.setNoteDragging(true)')
    pointer = { x: pointer.x + area.width, y: pointer.y }
    screen.emit('display-removed', {}, right)
    await waitFor(
      () =>
        note.getBounds().x + note.getBounds().width <= left.workArea.x + left.workArea.width + 1,
      '拔屏后恢复可见位置'
    )
    await pause(150)
    assert.ok(
      note.getBounds().x + note.getBounds().width <= left.workArea.x + left.workArea.width + 1,
      '屏幕恢复停止旧拖动，位置保持可见'
    )
    menuClick('隐藏桌面便签')
    await waitFor(() => !note.isVisible(), '屏幕变化前主动隐藏')
    screen.emit('display-metrics-changed', {}, left, ['workArea'])
    await pause(100)
    assert.equal(note.isVisible(), false, '屏幕变化不唤出主动隐藏的便签')
    trayClick()
    await waitFor(() => note.isVisible(), '恢复调整后的便签')
    assert.equal((await state(note)).collapsed, false)
  } finally {
    screen.getCursorScreenPoint = original.cursor
    screen.getAllDisplays = original.all
    screen.getDisplayMatching = original.matching
    screen.emit('display-metrics-changed', {}, display, ['workArea'])
    await move(80, 90)
  }
}
async function multidaySmoke(main, note) {
  if (phase === 'multiday-create') {
    await input(main, '[data-testid=task-new]', '持续整理需求')
    await input(note, '[data-testid=task-new]', '今天检查构建')
    await count(main, 2)
    await click(main, '[data-testid=task-convert]')
    await waitFor(
      () => js(note, 'Boolean(document.querySelector("[data-task-kind=multi-day]"))'),
      '多天转换同步'
    )
    assert.deepEqual(
      (await rows(note)).map(({ description }) => description),
      ['今天检查构建', '持续整理需求']
    )
    await input(note, '[data-testid=task-progress]', '42', null)
    await waitFor(
      () => js(main, 'document.querySelector(".task-progress span").textContent === "42%"'),
      '进度同步'
    )
    await click(main, '[data-task-kind=multi-day] input[type=checkbox]')
    await waitFor(
      () => js(note, 'document.querySelector(".task-progress span").textContent === "100%"'),
      '完成同步进度'
    )
    await click(note, '[data-task-kind=multi-day] input[type=checkbox]')
    await waitFor(
      () => js(main, 'document.querySelector(".task-progress span").textContent === "0%"'),
      '取消完成同步进度'
    )
    await input(main, '[data-testid=task-progress]', '42', null)
    await waitFor(
      () => js(note, 'document.querySelector(".task-progress span").textContent === "42%"'),
      '最终进度同步'
    )
  } else {
    assert.deepEqual(
      (await rows(note)).map(({ description }) => description),
      ['今天检查构建', '持续整理需求']
    )
    assert.equal(await js(note, 'document.querySelector(".task-progress span").textContent'), '42%')
    await click(note, '[data-task-kind=multi-day] [data-testid=task-description]')
    await input(note, '[data-testid=task-edit]', '持续整理完整需求')
    await waitFor(
      async () => (await rows(main))[1].description === '持续整理完整需求',
      '多天编辑同步'
    )
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
    await click(main, '[data-task-kind=multi-day] [data-testid=task-delete]')
    await count(note, 1)
  }
  assert.deepEqual(await rows(main), await rows(note))
  for (const [name, window] of [
    ['main', main],
    ['note', note]
  ]) {
    writeFileSync(
      resolve(output, `${name}-${phase}.png`),
      (await window.webContents.capturePage()).toPNG()
    )
  }
  console.log(`Electron multiday smoke passed: ${phase}`)
  menuClick('退出')
}

async function runSmoke() {
  try {
    await import('../out/main/index.js')
    await app.whenReady()
    let note = await waitFor(() => findWindow('note'), '启动显示便签')
    await ready(note)
    assert.equal(BrowserWindow.getAllWindows().length, 1, '启动只创建便签')
    await waitFor(() => trays.size === 1, '唯一托盘')
    await waitFor(() => note.isVisible(), '便签可见')
    if (phase === 'drag') {
      await draggingSmoke(note)
      const size = note.getContentSize()
      note.setBounds({ x: 200, y: 100, width: size[0], height: size[1] })
      note.emit('moved')
      await draggingSmoke(note)
      await draggingSmoke(note)
      await js(note, 'window.myTodo.setNoteDragging(true)')
      await js(note, 'window.myTodo.setNoteDragging(false)')
      assert.deepEqual(note.getMinimumSize(), [334, 260], '仅点击头部不锁死最小尺寸')
      console.log('Electron drag size passed')
      app.exit(0)
      return
    }
    assert.equal(note.isMenuBarVisible(), false)
    assert.equal(await js(note, 'Boolean(document.querySelector(".task-toolbar"))'), false)
    assert.equal(await js(note, 'document.querySelectorAll("[title]").length'), 0, '无多余悬停提示')
    menuClick('打开主界面')
    let main = await waitFor(() => findWindow('main'), '托盘打开主界面')
    assert.ok(main && note)
    await Promise.all([ready(main), ready(note)])
    if (phase.startsWith('subitems-')) {
      await subitemsSmoke({
        phase: phase.replace('subitems-', ''),
        main,
        note,
        input,
        click,
        js,
        waitFor
      })
      for (const [name, window] of [
        ['main', main],
        ['note', note]
      ]) {
        writeFileSync(
          resolve(output, `${name}-${phase}.png`),
          (await window.webContents.capturePage()).toPNG()
        )
      }
      console.log(`Electron subitems smoke passed: ${phase}`)
      menuClick('退出')
      return
    }
    if (phase.startsWith('multiday-')) {
      await multidaySmoke(main, note)
      return
    }
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
      await js(
        main,
        `(() => {
        const field = document.querySelector('[data-testid=task-new]');
        field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      })()`
      )
      await input(main, '[data-testid=task-new]', '中文组合输入', 'outside-click')
      await count(note, 0)
      await js(
        main,
        `document.querySelector('[data-testid=task-new]').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文组合输入' }))`
      )
      await count(note, 1)
      await waitFor(
        () => js(main, `document.querySelector('[data-testid=task-new]').value === ''`),
        '自动保存后清空新增栏'
      )
      await input(main, '[data-testid=task-new]', ' 检查构建 ', null)
      await js(
        main,
        `document.querySelector('[data-testid=task-new]').dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))`
      )
      await new Promise((resolve) => setTimeout(resolve, 200))
      assert.equal((await rows(note)).length, 1, '单纯移开鼠标不保存新增')
      await js(
        main,
        `document.querySelector('.task-list').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0 }))`
      )
      await count(note, 2)
      await waitFor(
        () => js(main, `document.querySelector('[data-testid=task-new]').value === ''`),
        '下一项保存后清空'
      )
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
      await js(main, `window.myTodo.deleteTask(${JSON.stringify((await rows(note)).at(-1).id)})`)
      await count(note, 1)
      await js(
        main,
        `(() => {
        const field = document.querySelector('[data-testid=task-new]');
        const set = value => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })); };
        set('保存期间清空的任务'); document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); set('');
      })()`
      )
      await count(note, 2)
      await waitFor(
        () => js(main, `!document.querySelector('.task-footer').textContent.includes('正在保存')`),
        '清空期间的保存完成'
      )
      await input(main, '[data-testid=task-new]', '清空后独立的新任务')
      await count(note, 3)
      assert.equal(
        (await rows(note))[1].description,
        '保存期间清空的任务',
        '下一项不覆盖已保存任务'
      )
      for (const task of (await rows(note)).slice(1))
        await js(main, `window.myTodo.deleteTask(${JSON.stringify(task.id)})`)
      await count(note, 1)
      await js(
        main,
        `(() => {
        const field = document.querySelector('[data-testid=task-new]');
        const set = value => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })); };
        const leave = () => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        set('保存进行中'); leave(); set('保存期间继续输入'); leave();
      })()`
      )
      await waitFor(
        async () => (await rows(note)).at(-1).description === '保存期间继续输入',
        '保存期间继续输入不丢字'
      )
      await count(note, 2)
      await waitFor(
        () => js(main, `document.querySelector('[data-testid=task-new]').value === ''`),
        '追赶输入保存后清空'
      )
      await js(main, `window.myTodo.deleteTask(${JSON.stringify((await rows(note))[0].id)})`)
      await count(note, 1)
      const originalDescription = (await rows(note))[0].description
      await edit(main, ' 检查构建并更新 ', null)
      await js(
        main,
        `document.querySelector('[data-testid=task-edit]').dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))`
      )
      await new Promise((resolve) => setTimeout(resolve, 200))
      assert.equal(
        (await rows(note))[0].description,
        originalDescription,
        '单纯移开鼠标不保存行内编辑'
      )
      await js(
        main,
        `document.querySelector('.task-list').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0 }))`
      )
      await waitFor(
        async () => (await rows(note))[0].description === '检查构建并更新',
        '行内编辑移开并点击后同步保存'
      )
      await count(note, 1)
      await waitFor(
        () => js(main, '!document.querySelector("[data-testid=task-edit]")'),
        '行内自动保存后结束编辑'
      )
      await input(note, '[data-testid=task-new]', '更新进展')
      await count(main, 2)
      for (const window of [main, note]) {
        const other = window === main ? note : main
        await edit(window, 'Esc不取消的修改', 'Escape')
        assert.equal(
          await js(window, `document.querySelector('[data-testid=task-edit]').value`),
          'Esc不取消的修改',
          'Esc保留行内编辑'
        )
        assert.equal(
          await js(
            window,
            `getComputedStyle(document.querySelector('[data-testid=task-edit]')).outlineStyle`
          ),
          'none',
          '编辑输入只有单层边框'
        )
        if (window === note)
          writeFileSync(
            resolve(output, 'note-editing.png'),
            (await note.webContents.capturePage()).toPNG()
          )
        await input(window, '[data-testid=task-edit]', '   ')
        await waitFor(
          () => js(window, 'Boolean(document.querySelector("[role=alert]"))'),
          '空白描述校验'
        )
        await input(
          window,
          '[data-testid=task-edit]',
          window === main ? ' 主界面已编辑 ' : ' 便签已编辑 ',
          'outside-click'
        )
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
      await input(note, '[data-testid=task-new]', '隐藏前保存', null)
      note.close()
      await waitFor(() => !note.isVisible(), '便签关闭后隐藏')
      await count(main, 3)
      assert.equal(main.isVisible(), true)
      await click(main, '[data-testid=open-other]')
      await waitFor(() => note.isVisible(), '恢复便签')
      await ready(note)
      assert.deepEqual(note.getPosition(), [80, 90])
      assert.equal(
        (await js(note, 'window.myTodo.listToday()')).data.tasks.at(-1).description,
        '隐藏前保存'
      )
      const hiddenTask = (await rows(main)).at(-1)
      await js(note, `window.myTodo.deleteTask(${JSON.stringify(hiddenTask.id)})`)
      await count(main, 2)
      await click(main, '[data-testid=open-other]')
      assert.equal(BrowserWindow.getAllWindows().length, 2)
      main.close()
      await waitFor(() => !main.isVisible(), '主界面关闭后隐藏')
      assert.equal(note.isVisible(), true)
      menuClick('打开主界面')
      await waitFor(() => main.isVisible(), '重开主界面')
      await ready(main)
      await count(main, 2)
      main.minimize()
      await waitFor(() => !main.isVisible(), '主界面最小化后隐藏')
      assert.equal(note.isVisible(), true)
      menuClick('隐藏桌面便签')
      await waitFor(() => !note.isVisible(), '托盘隐藏便签')
      assert.equal(BrowserWindow.getAllWindows().length, 2, '全部隐藏仍常驻')
      trayClick()
      await waitFor(() => note.isVisible() && note.isFocused(), '托盘恢复并聚焦')
      trayClick()
      assert.equal(BrowserWindow.getAllWindows().length, 2)
      note.close()
      trayClick()
      await new Promise((resolveWait) => setTimeout(resolveWait, 300))
      assert.equal(note.isVisible(), true, '保存握手期间的新唤出优先于旧隐藏请求')
      menuClick('打开主界面')
      await waitFor(() => main.isVisible(), '恢复主界面')
    } else {
      assert.deepEqual(note.getPosition(), [80, 90])
      assert.deepEqual(
        (await rows(main)).map(({ description, completed }) => ({ description, completed })),
        [
          { description: '持久化的任务描述', completed: true },
          { description: '检查构建', completed: false },
          { description: '退出前保存', completed: false }
        ]
      )
      assert.deepEqual(await rows(main), await rows(note))
    }
    if (phase === 'create') {
      for (let i = 0; i < 12; i++) await input(note, '[data-testid=task-new]', `长列表任务${i}`)
      await count(main, 14)
      const layout = await js(
        note,
        `(() => {
        const input = document.querySelector('[data-testid=task-new]').getBoundingClientRect();
        const list = document.querySelector('.task-list');
        return { inputBottom: input.bottom, height: innerHeight, scrollable: list.scrollHeight > list.clientHeight };
      })()`
      )
      assert.ok(layout.inputBottom <= layout.height, '长列表中新增入口始终可见')
      assert.equal(layout.scrollable, true, '任务列表独立滚动')
      const extra = (await rows(note)).slice(2)
      for (const task of extra) {
        const result = await js(note, `window.myTodo.deleteTask(${JSON.stringify(task.id)})`)
        assert.deepEqual(result, { ok: true, data: true })
      }
      await count(main, 2)
      await count(note, 2)
      await input(note, '[data-testid=task-new]', '先成功保存', 'outside-click')
      await count(main, 3)
      await waitFor(
        () => js(note, `document.querySelector('[data-testid=task-new]').value === ''`),
        '成功保存后准备下一项'
      )
      await js(note, `window.myTodo.deleteTask(${JSON.stringify((await rows(main)).at(-1).id)})`)
      await count(main, 2)
      const lock = new DatabaseSync(resolve(process.env.MYTODO_SMOKE_DATA, 'mytodo.sqlite'))
      let saveFailures = 0
      dialog.showMessageBox = async (_window, options) => {
        if (options.type === 'error') saveFailures++
        return { response: 1, checkboxChecked: false }
      }
      try {
        lock.exec('BEGIN IMMEDIATE')
        await input(note, '[data-testid=task-new]', '失败后保留输入', null)
        note.close()
        await waitFor(() => saveFailures === 1, '保存失败保留窗口')
        assert.equal(note.isVisible(), true)
        assert.equal(
          await js(note, 'document.querySelector("[data-testid=task-new]").value'),
          '失败后保留输入'
        )
        assert.match(
          await js(note, 'document.querySelector("[role=alert]").textContent'),
          /locked|锁/i
        )
        assert.doesNotMatch(
          await js(note, 'document.querySelector(".task-footer").textContent'),
          /已保存/,
          '失败的后续修改不显示已保存'
        )
      } finally {
        lock.exec('ROLLBACK')
        lock.close()
      }
      await input(note, '[data-testid=task-new]', '失败后重试保存')
      await count(main, 3)
      await js(note, `window.myTodo.deleteTask(${JSON.stringify((await rows(main)).at(-1).id)})`)
      await count(main, 2)
      await dockingSmoke(main, note)
      if (note.isAlwaysOnTop()) await click(note, '[data-testid=note-pin]')
      await waitFor(() => !note.isAlwaysOnTop(), '自由摆放取消置顶')
      await click(main, '[data-testid=open-settings]')
      await click(main, '[data-testid=default-pin]')
      await waitFor(
        async () => !(await state(main)).settings.defaultAlwaysOnTop,
        '默认置顶设置持久化'
      )
      assert.equal(note.isAlwaysOnTop(), false, '关闭默认置顶立即影响便签')
      await click(main, '[data-testid=default-pin]')
      await waitFor(() => note.isAlwaysOnTop(), '开启默认置顶立即影响便签')
      await click(main, '[data-testid=default-pin]')
      await waitFor(() => !note.isAlwaysOnTop(), '再次关闭默认置顶')
      await click(note, '[data-testid=note-pin]')
      await waitFor(() => note.isAlwaysOnTop(), '图钉临时开启')
      assert.equal((await state(main)).settings.defaultAlwaysOnTop, false, '图钉不改变启动默认值')
      await js(main, 'document.querySelector(".back-button").click()')
    } else {
      assert.equal(note.isAlwaysOnTop(), false, '重启采用设置默认值')
    }
    await habitsSmoke({ phase, main, note, input, click, js, waitFor, assert })
    await inspirationSmoke({ main, note, phase, js, click, input, waitFor })
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
    if (phase === 'create') {
      await input(note, '[data-testid=task-new]', '退出前保存', null)
      let failedQuit = false
      dialog.showMessageBox = async (_window, options) => {
        if (options.type === 'error') failedQuit = true
        return { response: 0, checkboxChecked: false }
      }
      await js(
        main,
        `(() => {
        window.myTodo.onWindowState(state => { if (state.exitPending) window.smokeExitLocked = document.body.inert });
        document.querySelector('[data-testid=task-new]').dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      })()`
      )
      menuClick('退出')
      await waitFor(() => failedQuit, '退出保存失败时保留应用')
      assert.equal(await js(main, 'window.smokeExitLocked'), true, '退出准备期间立即阻止新增输入')
      assert.equal(await js(main, 'document.body.inert'), false, '退出失败后解除输入锁')
      await js(
        main,
        `document.querySelector('[data-testid=task-new]').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))`
      )
    }
    menuClick('退出')
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
}
void runSmoke()

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
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)});
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
    if (key === 'Enter') window.webContents.sendInputEvent({ type: 'char', keyCode: key })
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
const editLayout = (window, selector) =>
  js(
    window,
    `(() => {
  const row = document.querySelector(${JSON.stringify(selector)}).closest('[data-task-id]');
  const text = row.querySelector('[data-testid=task-edit], [data-testid=task-description]');
  const style = getComputedStyle(text);
  const rect = element => { const { x, y, width, height } = element.getBoundingClientRect(); return { x, y, width, height }; };
  const source = row.querySelector('.task-edit-mirror') || text;
  const range = document.createRange(); range.setStart(source.firstChild, 0); range.setEnd(source.firstChild, 1);
  const glyph = range.getBoundingClientRect();
  return {
    rows: Array.from(document.querySelectorAll('[data-task-id]')).map(rect),
    text: rect(text),
    glyph: { x: glyph.x, y: glyph.y, width: glyph.width, height: glyph.height },
    controls: [row.querySelector('input[type=checkbox]'), row.querySelector('.task-delete')].map(rect),
    style: Object.fromEntries(['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'padding', 'borderWidth', 'color', 'textDecorationLine', 'whiteSpace', 'overflowWrap'].map(name => [name, style[name]]))
  };
})()`
  )

async function beginEdit(window, selector = '[data-testid=task-description]') {
  const before = await editLayout(window, selector)
  await click(window, selector)
  await waitFor(
    () => js(window, 'Boolean(document.querySelector("[data-testid=task-edit]"))'),
    '行内编辑'
  )
  assert.deepEqual(
    await editLayout(window, '[data-testid=task-edit]'),
    before,
    '进入行内编辑不改变文字、行高及相邻控件位置'
  )
  assert.notEqual(
    await js(
      window,
      `getComputedStyle(document.querySelector('[data-testid=task-edit]')).boxShadow`
    ),
    'none',
    '保留不占布局空间的编辑描边'
  )
  assert.equal(
    await js(
      window,
      `(() => { const field = document.querySelector('[data-testid=task-edit]'); return field.selectionStart === field.value.length && field.selectionEnd === field.value.length })()`
    ),
    true,
    '进入编辑时光标位于文字末尾'
  )
  return before
}
async function edit(window, value, key = 'Enter') {
  await beginEdit(window)
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

async function assertPushMotion(note, selector, edge, leaving = false) {
  const motion = await js(
    note,
    `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    const animation = element.getAnimations().find(item =>
      item.effect.getKeyframes().some(frame => frame.transform && frame.transform !== 'none'));
    if (!animation) return null;
    animation.pause();
    const duration = animation.effect.getTiming().duration;
    const rect = () => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    animation.currentTime = 0;
    const start = rect();
    animation.currentTime = duration;
    const end = rect();
    element.getAnimations().forEach(item => item.finish());
    return { start, end };
  })()`
  )
  assert.ok(motion, `${selector}必须整体平移推出，不能通过裁切刷出`)
  const { start, end } = motion
  const direction = leaving ? -1 : 1
  assert.ok(
    Math.abs(start.width - end.width) < 0.1 && Math.abs(start.height - end.height) < 0.1,
    '推出时整体尺寸保持不变'
  )
  if (edge === 'left')
    assert.ok(
      (end.x - start.x) * direction > 0 && Math.abs(start.y - end.y) < 0.1,
      leaving ? '左侧胶囊向左推回边缘' : '左侧胶囊向右推出'
    )
  if (edge === 'right')
    assert.ok(
      (end.x - start.x) * direction < 0 && Math.abs(start.y - end.y) < 0.1,
      leaving ? '右侧胶囊向右推回边缘' : '右侧胶囊向左推出'
    )
  if (edge === 'top')
    assert.ok(
      (end.y - start.y) * direction > 0 && Math.abs(start.x - end.x) < 0.1,
      leaving ? '顶部胶囊向上推回边缘' : '顶部胶囊向下推出'
    )
}

async function dockingSizeSmoke(note) {
  const cursor = screen.getCursorScreenPoint
  const area = screen.getPrimaryDisplay().workArea
  const size = note.getContentSize()
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const surface = () =>
    js(
      note,
      `(() => { const rect = document.querySelector('.tasks-page.note').getBoundingClientRect(); return [rect.width, rect.height] })()`
    )
  let pointer = { x: area.x + 100, y: area.y + 100 }
  screen.getCursorScreenPoint = () => pointer
  try {
    for (const edge of ['left', 'right', 'top']) {
      note.setBounds({ x: area.x + 80, y: area.y + 90, width: size[0], height: size[1] })
      note.emit('moved')
      await pause(100)
      assert.equal((await state(note)).edge, null)
      const before = await surface()
      const origin = note.getBounds()
      pointer = { x: origin.x + 80, y: origin.y + 25 }
      await js(note, 'window.myTodo.setNoteDragging(true)')
      const x =
        edge === 'left'
          ? area.x + 10
          : edge === 'right'
            ? area.x + area.width - size[0] - 10
            : area.x + 101
      const y = edge === 'top' ? area.y + 10 : area.y + 101
      pointer = { x: pointer.x + x - origin.x, y: pointer.y + y - origin.y }
      await waitFor(() => note.getBounds().x === x, '拖向吸附边缘')
      assert.deepEqual(note.getContentSize(), size, '吸附前内容尺寸不变')
      await js(note, 'window.myTodo.setNoteDragging(false)')
      await waitFor(async () => (await state(note)).edge === edge, '松手吸附')
      await pause(100)
      assert.deepEqual(note.getContentSize(), size, `${edge}吸附后内容尺寸不变`)
      assert.deepEqual(await surface(), before, `${edge}吸附后便签表面宽高不变`)
      const expanded = note.getBounds()
      pointer = { x: expanded.x + 40, y: expanded.y + 40 }
      await pause(100)
      pointer = { x: area.x + area.width / 2, y: area.y + area.height - 10 }
      await waitFor(async () => (await state(note)).noteMotion === 'closing', '便签沿贴边方向收回')
      assert.deepEqual(note.getContentSize(), size, '收回动画结束前保留便签绘制空间')
      await waitFor(async () => (await state(note)).collapsed, '吸附收起')
      const strip = note.getBounds()
      const preparingStrip = await js(
        note,
        `(() => {
        const handle = document.querySelector('.edge-handle');
        handle.classList.add('capsule-visible', 'capsule-preparing');
        const visibility = getComputedStyle(handle.querySelector('.edge-strip')).visibility;
        handle.classList.remove('capsule-visible', 'capsule-preparing');
        return visibility;
      })()`
      )
      assert.equal(preparingStrip, 'hidden', '胶囊准备阶段细条直接隐藏，不能在窗口调整时重绘闪动')
      pointer =
        edge === 'top'
          ? { x: strip.x + 20, y: area.y + 2 }
          : { x: edge === 'left' ? area.x + 2 : area.x + area.width - 2, y: strip.y + 20 }
      await waitFor(async () => (await state(note)).edgeRevealed, '悬停呼出胶囊')
      await assertPushMotion(note, '.edge-energy', edge)
      assert.equal(
        await js(note, `getComputedStyle(document.querySelector('.edge-strip')).visibility`),
        'hidden',
        '胶囊推出时独立细条直接隐藏'
      )
      assert.equal((await state(note)).collapsed, true, '悬停保持便签收起')
      if (phase === 'dock') {
        const summary = await js(note, `document.querySelector('.edge-capsule-tasks').textContent`)
        assert.match(summary, /1\/2/, '胶囊显示完成数和任务总数')
        assert.equal(
          await js(note, `document.querySelectorAll('.edge-capsule-summary svg').length`),
          0,
          '胶囊仅展示任务完成数和总数'
        )
        assert.equal(
          await js(
            note,
            `document.querySelector('.edge-energy-fill').style.${edge === 'top' ? 'width' : 'height'}`
          ),
          '50%',
          '完成比例不计入多天任务的部分进度'
        )
        writeFileSync(
          resolve(output, `note-capsule-${edge}.png`),
          (await note.webContents.capturePage()).toPNG()
        )
      }
      const beforeMove = note.getBounds()
      const press = { x: edge === 'right' ? 40 : 24, y: 24 }
      pointer = { x: beforeMove.x + press.x, y: beforeMove.y + press.y }
      note.webContents.sendInputEvent({
        type: 'mouseDown',
        ...press,
        button: 'left',
        clickCount: 1
      })
      await pause(80)
      pointer = {
        x: pointer.x + (edge === 'top' ? 40 : 8),
        y: pointer.y + (edge === 'top' ? 8 : 40)
      }
      await waitFor(
        () =>
          edge === 'top'
            ? note.getBounds().x === beforeMove.x + 40
            : note.getBounds().y === beforeMove.y + 40,
        '按住胶囊沿边移动'
      )
      assert.equal(
        edge === 'top' ? note.getBounds().y : note.getBounds().x,
        edge === 'top' ? beforeMove.y : beforeMove.x,
        '拖动保持贴边'
      )
      note.webContents.sendInputEvent({ type: 'mouseMove', ...press })
      note.webContents.sendInputEvent({ type: 'mouseUp', ...press, button: 'left', clickCount: 1 })
      await pause(100)
      assert.equal((await state(note)).collapsed, true, '拖动松手不展开便签')
      pointer = { x: area.x + area.width / 2, y: area.y + area.height - 10 }
      await waitFor(async () => !(await state(note)).edgeRevealed, '胶囊开始收回')
      assert.equal((await state(note)).edgeCapsuleVisible, true, '胶囊收回动画保留绘制空间')
      await assertPushMotion(note, '.edge-energy', edge, true)
      assert.equal(
        await js(note, `getComputedStyle(document.querySelector('.edge-energy')).opacity`),
        '0',
        '胶囊推回边缘后淡出'
      )
      assert.equal(
        await js(note, `getComputedStyle(document.querySelector('.edge-strip')).visibility`),
        'hidden',
        '胶囊退出结束前细条保持隐藏'
      )
      await waitFor(async () => !(await state(note)).edgeCapsuleVisible, '胶囊沿边收回后恢复细条')
      const movedStrip = note.getBounds()
      pointer =
        edge === 'top'
          ? { x: movedStrip.x + 20, y: area.y + 2 }
          : { x: edge === 'left' ? area.x + 2 : area.x + area.width - 2, y: movedStrip.y + 20 }
      await waitFor(async () => (await state(note)).edgeRevealed, '再次呼出胶囊')
      await click(note, '.edge-handle')
      await waitFor(
        async () => (await state(note)).noteMotion === 'opening',
        '胶囊沿贴边方向扩展为便签'
      )
      const revision = (await state(note)).noteMotionRevision
      await js(note, `window.myTodo.finishNoteMotion(${revision - 1})`)
      assert.equal((await state(note)).noteMotion, 'opening', '过期动画回调不能结束当前过渡')
      assert.equal(
        await js(
          note,
          `document.querySelector('.note-morph-surface').getAnimations().some(animation => animation.effect.getKeyframes().some(frame => frame.transform && frame.borderRadius))`
        ),
        true,
        '胶囊到便签使用独立共享表面的投影和圆角校正'
      )
      assert.equal(
        await js(
          note,
          `document.querySelector('.tasks-page.note').getAnimations().some(animation => animation.effect.getKeyframes().some(frame => frame.transform))`
        ),
        false,
        '任务文字不随表面非等比缩放'
      )
      if (phase === 'dock') {
        await js(
          note,
          `document.querySelectorAll('.note-morph-surface, .tasks-page.note, .note-morph-source').forEach(element => element.getAnimations().forEach(animation => animation.pause()))`
        )
        for (const fraction of [0, 0.12, 0.25, 0.6, 1]) {
          await js(
            note,
            `(() => { const duration = document.querySelector('.note-morph-surface').getAnimations()[0].effect.getTiming().duration; document.querySelectorAll('.note-morph-surface, .tasks-page.note, .note-morph-source').forEach(element => element.getAnimations().forEach(animation => animation.currentTime = ${fraction} * duration)); })()`
          )
          writeFileSync(
            resolve(output, `note-morph-${edge}-${fraction}.png`),
            (await note.webContents.capturePage()).toPNG()
          )
        }
        await js(
          note,
          `document.querySelectorAll('.note-morph-surface, .tasks-page.note, .note-morph-source').forEach(element => element.getAnimations().forEach(animation => animation.finish()))`
        )
      }
      await waitFor(async () => !(await state(note)).collapsed, '点击胶囊展开便签')
      await waitFor(async () => !(await state(note)).noteMotion, '便签展开动画完成')
      const footer = await js(
        note,
        `(() => {
        const input = document.querySelector('.note-add-controls').getBoundingClientRect();
        const summary = document.querySelector('.note-summary').getBoundingClientRect();
        return { inputHeight: input.height, summaryHeight: summary.height, inputTop: input.top, summaryTop: summary.top, inputRight: input.right, summaryLeft: summary.left, progress: document.querySelector('.note-progress-value').getAttribute('stroke-dasharray') };
      })()`
      )
      assert.equal(footer.summaryHeight, footer.inputHeight, '圆环进度与新增输入胶囊等高')
      assert.equal(footer.summaryTop, footer.inputTop, '圆环与输入胶囊同排对齐')
      assert.ok(footer.summaryLeft > footer.inputRight, '圆环位于输入胶囊右侧')
      if (phase === 'dock') assert.equal(footer.progress, '50 100', '圆环按完成任务数显示进度')
      assert.deepEqual(note.getContentSize(), size, `${edge}收起展开后内容尺寸不变`)
      assert.deepEqual(await surface(), before, `${edge}收起展开后便签表面宽高不变`)
    }
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
    await dockingSizeSmoke(note)
    await move(area.x + 80, area.y + 90)
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
    await move(area.x + 18, area.y + 100)
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
    await waitFor(async () => (await state(note)).edgeRevealed, '悬停呼出胶囊')
    assert.equal((await state(note)).collapsed, true, '悬停不展开便签')
    assert.equal(main.isFocused(), true, '悬停胶囊不抢焦点')
    await click(note, '.edge-handle')
    await waitFor(async () => !(await state(note)).collapsed, '点击展开便签')
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
    await waitFor(async () => (await state(note)).collapsed, '托盘唤出后鼠标未进入也能自动收回')
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
    if (phase === 'lifecycle') {
      const area = screen.getPrimaryDisplay().workArea
      note.setPosition(area.x + 5, area.y + 80)
      note.emit('moved')
      await waitFor(async () => (await state(note)).edge === 'left', '销毁前吸附便签')
      const failures = []
      process.setUncaughtExceptionCaptureCallback((error) => failures.push(error.message))
      note.destroy()
      await new Promise((resolve) => setTimeout(resolve, 500))
      process.setUncaughtExceptionCaptureCallback(null)
      assert.deepEqual(failures, [], '窗口销毁后不得继续轮询或执行动画回调')
      console.log('Electron destroyed-window lifecycle passed')
      app.exit(0)
      return
    }
    if (phase === 'dock') {
      await js(
        note,
        `(async () => {
        const first = (await window.myTodo.createTask('已完成任务')).data;
        await window.myTodo.setTaskCompleted(first.id, true);
        const second = (await window.myTodo.createTask('推进中的任务')).data;
        await window.myTodo.convertToMultiDay(second.id);
        await window.myTodo.setTaskProgress(second.id, 60);
        await window.myTodo.createInspiration('胶囊灵感');
      })()`
      )
      await count(note, 2)
      await dockingSizeSmoke(note)
      const cursor = screen.getCursorScreenPoint
      const area = screen.getPrimaryDisplay().workArea
      screen.getCursorScreenPoint = () => ({
        x: area.x + area.width - 10,
        y: area.y + area.height - 10
      })
      try {
        trayClick()
        await waitFor(
          async () => !(await state(note)).collapsed && note.isFocused(),
          '托盘唤出贴边便签'
        )
        await waitFor(async () => (await state(note)).collapsed, '无需先进入便签即可自动收回')
        trayClick()
        await waitFor(
          async () => !(await state(note)).collapsed && !(await state(note)).noteMotion,
          '输入前完整展开便签'
        )
        await click(note, '.note-add-button')
        await waitFor(
          () => js(note, `document.activeElement?.dataset.testid === 'task-new'`),
          '空输入框聚焦'
        )
        await new Promise((resolve) => setTimeout(resolve, 1100))
        assert.equal((await state(note)).collapsed, false, '空输入框聚焦时鼠标移出也不自动收回')
        await js(note, `document.querySelector('[data-testid=task-new]').blur()`)
        await waitFor(async () => (await state(note)).collapsed, '输入框失焦后恢复自动收回')
      } finally {
        screen.getCursorScreenPoint = cursor
      }
      console.log('Electron dock size passed')
      app.exit(0)
      return
    }
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
    assert.equal(
      await js(note, 'document.querySelector("[data-testid=note-close]").title'),
      '隐藏桌面便签',
      '图标操作提供悬停说明'
    )
    menuClick('打开主界面')
    let main = await waitFor(() => findWindow('main'), '托盘打开主界面')
    assert.ok(main && note)
    if (phase.startsWith('topics-')) {
      await waitFor(
        () => js(main, 'Boolean(document.querySelector(".workbench-header h1"))'),
        '工作台就绪'
      )
      await js(
        main,
        `Array.from(document.querySelectorAll('.workbench-nav button')).find(x => x.textContent === '灵感').click()`
      )
      if (phase === 'topics-create') {
        await click(main, '.primary-button')
        await input(main, '[data-testid=task-new]', '跨窗口主题灵感')
        await waitFor(
          () =>
            js(
              main,
              `document.querySelector('[data-testid=inspiration-summary]')?.textContent.includes('跨窗口主题灵感')`
            ),
          '灵感创建'
        )
        await click(main, '[aria-label="归集主题"]')
        await input(main, '[aria-label="新主题名称"]', '持久主题')
        await waitFor(
          () =>
            js(
              main,
              `document.querySelector('.inspiration-topic-picker')?.textContent.includes('持久主题')`
            ),
          '创建主题'
        )
        await input(main, '[aria-label="搜索主题"]', '不存在', '')
        assert.equal(
          await js(
            main,
            `Boolean(document.querySelector('.inspiration-topic-picker input[type=checkbox]'))`
          ),
          false
        )
        await input(main, '[aria-label="搜索主题"]', '持久', '')
        assert.equal(
          await js(
            main,
            `document.querySelector('.inspiration-topic-picker input[type=checkbox]').checked`
          ),
          true
        )
        await input(main, '[aria-label="搜索主题"]', '', '')
        await input(main, '[aria-label="新主题名称"]', '另一个主题')
        await waitFor(
          () =>
            js(
              main,
              `document.querySelectorAll('.inspiration-topic-picker input[type=checkbox]').length === 2`
            ),
          '多主题创建'
        )
        await js(
          main,
          `(() => { const box = Array.from(document.querySelectorAll('.inspiration-topic-picker label')).find(label => label.textContent.includes('另一个主题')).querySelector('input'); box.click(); box.click(); box.click(); })()`
        )
        await waitFor(
          () =>
            js(
              main,
              `(async () => (await window.myTodo.listInspirations()).data[0].topicIds.length === 1)()`
            ),
          '连续切换后的关联'
        )
        await waitFor(
          () =>
            js(
              main,
              `document.querySelectorAll('.inspiration-topic-picker input[type=checkbox]:checked').length === 1`
            ),
          '连续切换后的选中状态'
        )
        await input(main, '[aria-label="新主题名称"]', '   ')
        await waitFor(
          () =>
            js(
              main,
              `document.querySelector('[role=alert]')?.textContent.includes('主题名称不能为空')`
            ),
          '创建失败提示'
        )
        await click(main, '[aria-label="关闭提示"]')
        await input(main, '[aria-label="新主题名称"]', '持久主题二')
        await waitFor(
          () =>
            js(
              main,
              `document.querySelectorAll('.inspiration-topic-picker input[type=checkbox]:checked').length === 2`
            ),
          '失败后继续创建'
        )
        writeFileSync(
          resolve(output, 'inspiration-topic-picker.png'),
          (await main.webContents.capturePage()).toPNG()
        )
        await click(main, '[data-testid=inspiration-supplement]')
        await input(main, '[data-testid=inspiration-addition]', '持久补充')
        await waitFor(
          () =>
            js(
              main,
              `document.querySelector('.inspiration-additions')?.textContent.includes('持久补充')`
            ),
          '补充保存'
        )
        await waitFor(
          () =>
            js(
              note,
              `document.querySelector('[data-testid=note-inspiration-count]')?.textContent.trim() === '1'`
            ),
          '便签灵感数量同步'
        )
        await js(
          note,
          `(async () => { const idea = (await window.myTodo.listInspirations()).data[0]; await window.myTodo.updateInspiration(idea.id, '双窗口更新') })()`
        )
        await waitFor(
          () =>
            js(
              main,
              `document.querySelector('.inspiration-original')?.textContent === '双窗口更新'`
            ),
          '正文跨窗口同步'
        )
      } else {
        await waitFor(
          () =>
            js(main, `document.querySelector('.inspiration-group-title')?.textContent === '今天'`),
          '重启进入今天'
        )
        await js(
          main,
          `Array.from(document.querySelectorAll('.inspiration-views button')).find(x => x.textContent === '主题').click()`
        )
        await waitFor(
          () =>
            js(
              main,
              `Array.from(document.querySelectorAll('.inspiration-nav-item .inspiration-heading')).some(x => x.textContent.includes('持久主题'))`
            ),
          '重启后主题保留'
        )
        await js(
          main,
          `Array.from(document.querySelectorAll('.inspiration-nav-item .inspiration-heading')).find(x => x.textContent.includes('持久主题')).click()`
        )
        await waitFor(
          () =>
            js(
              main,
              `document.querySelector('[data-testid=inspiration-summary]')?.textContent === '双窗口更新'`
            ),
          '重启后关联和正文保留'
        )
        await click(main, '[data-testid=inspiration-supplement]')
        await waitFor(
          () =>
            js(
              main,
              `document.querySelector('.inspiration-additions')?.textContent.includes('持久补充')`
            ),
          '重启后补充保留'
        )
        assert.equal(
          (await js(note, 'window.myTodo.listInspirations()')).data[0].description,
          '双窗口更新'
        )
        assert.equal(
          await js(
            note,
            `document.querySelector('[data-testid=note-inspiration-count]').textContent.trim()`
          ),
          '1'
        )
      }
      console.log(`Electron topics smoke passed: ${phase}`)
      menuClick('退出')
      return
    }
    if (phase === 'workbench') {
      await waitFor(
        () => js(main, 'Boolean(document.querySelector(".workbench-header h1"))'),
        '工作台就绪'
      )
      assert.equal(
        await js(main, 'document.querySelector(".workbench-header h1").textContent'),
        '今天'
      )
      await click(main, '.primary-button')
      await input(main, '[data-testid=task-new]', '取消的任务', null)
      await js(
        main,
        `(() => { const button = Array.from(document.querySelectorAll('.workbench-add button')).find(x => x.textContent === '取消'); button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); button.click() })()`
      )
      await count(note, 0)
      await click(main, '.primary-button')
      const lock = new DatabaseSync(resolve(process.env.MYTODO_SMOKE_DATA, 'mytodo.sqlite'))
      try {
        lock.exec('BEGIN IMMEDIATE')
        await input(main, '[data-testid=task-new]', '失败后保留草稿')
        await waitFor(
          () => js(main, 'Boolean(document.querySelector("[role=alert]"))'),
          '保存失败反馈'
        )
        assert.equal(
          await js(main, 'document.querySelector("[data-testid=task-new]").value'),
          '失败后保留草稿'
        )
      } finally {
        lock.exec('ROLLBACK')
        lock.close()
      }
      await input(main, '[data-testid=task-new]', '工作台任务')
      await count(note, 1)
      writeFileSync(
        resolve(output, 'workbench-tasks.png'),
        (await main.webContents.capturePage()).toPNG()
      )
      await click(main, '[data-testid=task-description]')
      await input(main, '[data-testid=task-edit]', '更新工作台任务', null)
      await click(main, '.detail-back')
      await waitFor(
        async () => (await rows(note))[0].description === '更新工作台任务',
        '任务详情同步'
      )
      await click(main, '[data-task-id] input[type=checkbox]')
      await waitFor(async () => (await rows(note))[0].completed, '完成状态同步')
      await js(
        main,
        `Array.from(document.querySelectorAll('.workbench-nav button')).find(x => x.textContent === '习惯').click()`
      )
      await click(main, '.primary-button')
      await input(main, '[data-testid=habit-new]', '每天检查')
      await waitFor(
        () =>
          js(
            main,
            'document.querySelector("[data-testid=habit-description]")?.textContent === "每天检查"'
          ),
        '习惯保存'
      )
      await js(
        main,
        `Array.from(document.querySelectorAll('.workbench-nav button')).find(x => x.textContent === '灵感').click()`
      )
      await click(main, '.primary-button')
      await input(main, '[data-testid=task-new]', '新的灵感')
      await click(main, '[data-testid=inspiration-summary]')
      await input(main, '[data-testid=inspiration-edit]', '编辑后的灵感')
      await click(main, '[data-testid=inspiration-supplement]')
      await waitFor(
        () =>
          js(
            main,
            'document.querySelector(".inspiration-original")?.textContent === "编辑后的灵感"'
          ),
        '原地编辑保存并打开详情'
      )
      assert.equal(
        await js(main, 'document.querySelector(".inspiration-original").textContent'),
        '编辑后的灵感'
      )
      assert.equal(
        await js(
          main,
          '!!document.querySelector(".inspiration-detail [data-testid=inspiration-edit-original]")'
        ),
        false
      )
      await input(main, '[data-testid=inspiration-addition]', '补充内容')
      await waitFor(
        () =>
          js(
            main,
            'document.querySelector(".inspiration-additions")?.textContent.includes("补充内容")'
          ),
        '灵感补充'
      )
      main.setContentSize(600, 700)
      await waitFor(
        () =>
          js(
            main,
            'getComputedStyle(document.querySelector(".inspiration-detail")).position === "static"'
          ),
        '窄窗口详情'
      )
      writeFileSync(
        resolve(output, 'workbench-narrow.png'),
        (await main.webContents.capturePage()).toPNG()
      )
      await click(main, '.inspiration-detail .detail-back')
      await click(main, '[aria-label="归集主题"]')
      await input(main, '[aria-label="新主题名称"]', '产品构想')
      await waitFor(
        () =>
          js(
            main,
            `document.querySelector('.inspiration-topic-picker')?.textContent.includes('产品构想')`
          ),
        '主题创建'
      )
      await input(main, '[aria-label="新主题名称"]', '工作流')
      await waitFor(
        () =>
          js(
            main,
            `document.querySelector('.inspiration-topic-picker')?.textContent.includes('工作流')`
          ),
        '第二主题创建'
      )
      const chooseView = (view) =>
        js(
          main,
          `Array.from(document.querySelectorAll('.inspiration-views button')).find(x => x.textContent === '${view}').click()`
        )
      const chooseGroup = (name) =>
        js(
          main,
          `Array.from(document.querySelectorAll('.inspiration-nav-item .inspiration-heading')).find(x => x.textContent === '${name}').click()`
        )
      await chooseView('主题')
      await waitFor(
        () => js(main, `document.querySelectorAll('.inspiration-nav-item').length === 3`),
        '主题导航'
      )
      await chooseGroup('产品构想')
      await waitFor(
        () => js(main, `document.querySelectorAll('[data-inspiration-id]').length === 1`),
        '主题内容'
      )
      assert.equal(
        await js(main, `document.querySelectorAll('.inspiration-date-group').length`),
        1,
        '一次只展示一组'
      )
      assert.match(
        await js(main, `document.querySelector('.inspiration-row time').textContent`),
        /^\d{4}-\d{2}-\d{2}$/
      )
      await click(main, '[data-testid=inspiration-supplement]')
      await chooseGroup('工作流')
      await waitFor(
        () =>
          js(
            main,
            `!document.querySelector('.inspiration-detail') && Boolean(document.querySelector('[data-inspiration-id]'))`
          ),
        '切组关闭详情'
      )
      await click(main, '[data-testid=inspiration-supplement]')
      await chooseView('日期')
      await waitFor(
        () =>
          js(main, `document.querySelector('.inspiration-group-title')?.textContent === '今天'`),
        '返回日期'
      )
      main.setContentSize(1100, 800)
      await chooseView('主题')
      await waitFor(
        () =>
          js(
            main,
            `document.querySelector('.inspiration-group-title')?.textContent === '工作流' && Boolean(document.querySelector('.inspiration-detail'))`
          ),
        '恢复主题组及详情'
      )
      writeFileSync(
        resolve(output, 'inspiration-topic-detail.png'),
        (await main.webContents.capturePage()).toPNG()
      )
      await chooseView('日期')
      await waitFor(
        () =>
          js(main, `document.querySelector('.inspiration-group-title')?.textContent === '今天'`),
        '日期导航'
      )
      const headings = await js(
        main,
        `Array.from(document.querySelectorAll('.inspiration-nav-item .inspiration-heading')).map(x => x.textContent)`
      )
      const localDate = (daysAgo) => {
        const date = new Date()
        date.setDate(date.getDate() - daysAgo)
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      }
      assert.deepEqual(headings, [
        '今天',
        ...Array.from({ length: 6 }, (_, i) => localDate(i + 1)),
        '历史灵感'
      ])
      await js(
        main,
        `(async () => { for (let i = 0; i < 25; i++) { const result = await window.myTodo.createInspiration('分页灵感 ' + String(i).padStart(2, '0')); if (!result.ok) throw new Error('创建灵感失败'); } })()`
      )
      await waitFor(
        () => js(main, `document.querySelectorAll('.inspiration-item').length === 20`),
        '当前组首页'
      )
      await js(
        main,
        `document.querySelector('.inspiration-list').scrollTop = document.querySelector('.inspiration-list').scrollHeight`
      )
      await waitFor(
        () => js(main, `document.querySelectorAll('.inspiration-item').length === 26`),
        '当前组下滑分页'
      )
      const loadedIdeas = await js(
        main,
        `Array.from(document.querySelectorAll('.inspiration-item')).map(x => x.dataset.inspirationId)`
      )
      assert.equal(new Set(loadedIdeas).size, 26, '分页无重复')
      await js(
        main,
        `(async () => { const topic = (await window.myTodo.listInspirationTopics()).data.find(x => x.name === '工作流'); for (const idea of (await window.myTodo.listInspirations()).data) await window.myTodo.setInspirationTopic(idea.id, topic.id, true) })()`
      )
      await chooseView('主题')
      await waitFor(
        () =>
          js(main, `document.querySelector('.inspiration-group-title')?.textContent === '工作流'`),
        '恢复主题分组'
      )
      await waitFor(
        () => js(main, `document.querySelectorAll('.inspiration-item').length >= 20`),
        '主题首页'
      )
      await js(
        main,
        `document.querySelector('.inspiration-list').scrollTop = document.querySelector('.inspiration-list').scrollHeight`
      )
      await waitFor(
        () => js(main, `document.querySelectorAll('.inspiration-item').length === 26`),
        '主题下滑分页'
      )
      assert.equal(
        await js(
          main,
          `new Set(Array.from(document.querySelectorAll('.inspiration-item')).map(x => x.dataset.inspirationId)).size`
        ),
        26,
        '主题分页无遗漏和重复'
      )
      await click(main, '[data-testid=open-settings]')
      assert.equal(
        await js(main, 'document.querySelector(".workbench-header h1").textContent'),
        '设置'
      )
      console.log('Electron workbench smoke passed')
      menuClick('退出')
      return
    }
    await Promise.all([
      phase.startsWith('order-')
        ? waitFor(
            () => js(main, 'Boolean(document.querySelector(".workbench-header h1"))'),
            '主界面就绪'
          )
        : ready(main),
      ready(note)
    ])
    if (phase.startsWith('order-')) {
      if (phase === 'order-create') {
        const result = await js(
          note,
          `(async () => {
          const tasks = [];
          for (const text of ['任务甲', '任务乙', '任务丙', '推进甲', '推进乙']) {
            const result = await window.myTodo.createTask(text);
            if (!result.ok) throw new Error(result.error);
            tasks.push(result.data);
          }
          for (const task of tasks.slice(3)) await window.myTodo.convertToMultiDay(task.id);
          return tasks;
        })()`
        )
        await count(note, 5)
        const drag = async (source, target) => {
          const selector = (id) => `[data-task-id="${id}"]`
          await js(
            note,
            `document.querySelector(${JSON.stringify(selector(source))}).dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }))`
          )
          await js(
            note,
            `(() => {
            const target = document.querySelector(${JSON.stringify(selector(target))});
            target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientY: target.getBoundingClientRect().top + 1, dataTransfer: new DataTransfer() }));
          })()`
          )
          await js(
            note,
            `document.querySelector(${JSON.stringify(selector(target))}).dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }))`
          )
        }
        await drag(result[2].id, result[0].id)
        await waitFor(async () => (await rows(note))[0].id === result[2].id, '今天任务拖动排序')
        await click(note, '.note-group-heading[aria-expanded=false]')
        await drag(result[4].id, result[3].id)
        await waitFor(async () => (await rows(note))[3].id === result[4].id, '多天任务拖动排序')
        const pointerAt = async (selector) => {
          const point = await js(
            note,
            `(() => {
            const bounds = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
            return { x: Math.round(bounds.x + bounds.width / 2), y: Math.round(bounds.y + bounds.height / 2) };
          })()`
          )
          note.webContents.sendInputEvent({ type: 'mouseMove', ...point })
          return point
        }
        note.focus()
        await pointerAt(`[data-task-id="${result[1].id}"] [data-testid=task-delete]`)
        await waitFor(
          () =>
            js(
              note,
              `getComputedStyle(document.querySelector('[data-task-id="${result[1].id}"] .note-task-secondary')).visibility === 'visible'`
            ),
          '悬停叉号展开置顶'
        )
        const point = await pointerAt(`[data-task-id="${result[1].id}"] [data-testid=task-pin]`)
        note.webContents.sendInputEvent({
          type: 'mouseDown',
          ...point,
          button: 'left',
          clickCount: 1
        })
        note.webContents.sendInputEvent({
          type: 'mouseUp',
          ...point,
          button: 'left',
          clickCount: 1
        })
        await waitFor(async () => (await rows(main))[0].id === result[1].id, '置顶同步主界面')
        assert.equal(
          await js(
            note,
            `(() => {
          const pin = document.querySelector('[data-testid=task-pin]');
          return pin.parentElement.nextElementSibling.dataset.testid === 'task-delete' && pin === pin.parentElement.lastElementChild;
        })()`
          ),
          true,
          '置顶按钮紧邻叉号左边'
        )
      }
      assert.deepEqual(
        (await rows(note)).map((row) => row.description),
        ['任务乙', '任务丙', '任务甲', '推进乙', '推进甲']
      )
      assert.equal(
        await js(
          note,
          `document.querySelector('[data-testid=task-pin]').getAttribute('aria-pressed')`
        ),
        'true'
      )
      if (phase === 'order-create') {
        assert.equal(
          await js(
            note,
            `document.querySelector('[data-testid=note-inspiration-count]').textContent.trim()`
          ),
          '0'
        )
        await js(main, `window.myTodo.createInspiration('底部圆环验证')`)
        await waitFor(
          () =>
            js(
              note,
              `document.querySelector('[data-testid=note-inspiration-count]').textContent.trim() === '1'`
            ),
          '灵感数量跨窗口同步'
        )
        await click(note, '[data-testid=new-kind-inspiration]')
        await click(note, '.note-add-button')
        assert.equal(
          await js(
            note,
            `document.querySelector('.note-add-controls').classList.contains('is-inspiration')`
          ),
          true
        )
        assert.equal(
          await js(
            note,
            `(() => {
          const input = document.querySelector('[data-testid=task-new]').getBoundingClientRect();
          const task = document.querySelector('.note-summary').getBoundingClientRect();
          const idea = document.querySelector('[data-testid=note-inspiration-count]').getBoundingClientRect();
          return input.width > 50 && input.right <= task.left && task.right < idea.left && Math.abs(task.y - idea.y) < 1;
        })()`
          ),
          true,
          '输入与两个圆环同排且不重叠'
        )
      }
      writeFileSync(
        resolve(output, `note-${phase}.png`),
        (await note.webContents.capturePage()).toPNG()
      )
      console.log(`Electron order smoke passed: ${phase}`)
      menuClick('退出')
      return
    }
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
          '编辑输入不出现额外焦点外框'
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
      const wrappingTask = (
        await js(
          main,
          `window.myTodo.createTask(${JSON.stringify('检查行内编辑的位置与换行：保留原来的字体和间距，点击前后任务内容和勾选框都保持稳定。Mixed words, 中文与标点。\n第二行同样保持原位。')})`
        )
      ).data
      await count(note, 3)
      for (const window of [main, note]) {
        const selector = `[data-task-id="${wrappingTask.id}"] [data-testid=task-description]`
        const before = await beginEdit(window, selector)
        if (window === note)
          writeFileSync(
            resolve(output, 'note-editing-wrapped.png'),
            (await window.webContents.capturePage()).toPNG()
          )
        await js(
          window,
          `document.querySelector('.task-list').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`
        )
        await waitFor(
          () => js(window, '!document.querySelector("[data-testid=task-edit]")'),
          '退出多行编辑'
        )
        assert.deepEqual(await editLayout(window, selector), before, '结束行内编辑保持原布局')
      }
      await js(main, `window.myTodo.deleteTask(${JSON.stringify(wrappingTask.id)})`)
      await count(note, 2)
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

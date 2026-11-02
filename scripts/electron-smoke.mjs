import { habitArchiveSmoke } from './habit-archive-smoke.mjs'
import { noteJottingsSmoke } from './note-jottings-smoke.mjs'
import { appearanceSmoke } from './appearance-smoke.mjs'
import { listInteractionSmoke } from './list-interaction-smoke.mjs'
import { inspirationPageSmoke } from './inspiration-page-smoke.mjs'
import { subitemsSmoke } from './subitems-smoke.mjs'
import { noteArchiveSmoke } from './note-archive-smoke.mjs'
import { mainOverviewSmoke } from './main-overview-smoke.mjs'
import { deleteConfirmationSmoke } from './delete-confirmation-smoke.mjs'
import { habitsSmoke } from './smoke-habits.mjs'
import { app, BrowserWindow, dialog, Tray, screen } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { inspirationSmoke } from './inspiration-smoke.mjs'
import { topicRefinementSmoke } from './topic-refinement-smoke.mjs'

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
const js = (window, code) =>
  window.webContents.executeJavaScript(code).catch((error) => {
    throw new Error(`Renderer script failed: ${code}\n${error.message}`)
  })
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
  await js(
    window,
    `(() => {
    const field = document.querySelector(${JSON.stringify(selector)});
    if (field?.closest('.inline-composer[hidden]')) {
      const label = field.dataset.testid?.startsWith('habit') ? '新增习惯' : '新增任务';
      document.querySelector('[aria-label="' + label + '"]')?.click();
    }
  })()`
  )
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
// 创建并归集成功会关闭浮层；连续测试在原记录仍可见的日期组重新打开。
const createTopicAndReopen = async (window, name) => {
  await input(window, '[aria-label="新主题名称"]', name)
  await waitFor(
    () => js(window, `!document.querySelector('.inspiration-topic-picker')`),
    '创建归集后关闭'
  )
  await click(window, '[aria-label="归集主题"]')
  await waitFor(
    () =>
      js(
        window,
        `Array.from(document.querySelectorAll('.inspiration-topic-picker label')).some(x => x.textContent.includes(${JSON.stringify(name)}))`
      ),
    '重新打开已保存主题'
  )
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
    await click(main, '[data-task-kind=multi-day] [data-testid=task-delete]')
    await click(main, '[data-testid=delete-confirm]')
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
        await window.myTodo.createInspiration('胶囊小记');
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
    if (phase.startsWith('note-jottings-')) {
      await noteJottingsSmoke({
        main,
        note,
        phase,
        js,
        click,
        input,
        waitFor,
        capture: async (window, name) =>
          writeFileSync(resolve(output, name), (await window.webContents.capturePage()).toPNG())
      })
      console.log(`Electron note jottings smoke passed: ${phase}`)
      menuClick('退出')
      return
    }
    if (phase.startsWith('appearance-')) {
      await appearanceSmoke({
        main,
        note,
        phase,
        js,
        click,
        waitFor,
        capture: async (window, name) =>
          writeFileSync(resolve(output, name), (await window.webContents.capturePage()).toPNG())
      })
      console.log(`Electron appearance smoke passed: ${phase}`)
      menuClick('退出')
      return
    }
    if (phase === 'habit-archive') {
      await habitArchiveSmoke({ main, note, js, click, input, waitFor, assert })
      console.log('Electron habit archive smoke passed')
      menuClick('退出')
      return
    }
    if (phase === 'delete-confirmation') {
      await deleteConfirmationSmoke({
        main,
        note,
        js,
        click,
        input,
        waitFor,
        assert,
        dialog,
        capture: async (window, name) =>
          writeFileSync(resolve(output, name), (await window.webContents.capturePage()).toPNG())
      })
      console.log('Electron delete confirmation smoke passed')
      menuClick('退出')
      return
    }
    if (phase === 'main-overview') {
      await mainOverviewSmoke({
        main,
        note,
        js,
        click,
        waitFor,
        assert,
        dialog,
        capture: async (window, name) =>
          writeFileSync(resolve(output, name), (await window.webContents.capturePage()).toPNG())
      })
      console.log('Electron main overview smoke passed')
      menuClick('退出')
      return
    }
    if (phase.startsWith('inspiration-page-')) {
      await inspirationPageSmoke({
        main,
        note,
        phase,
        js,
        click,
        input,
        waitFor,
        capture: async (window, name) =>
          writeFileSync(resolve(output, name), (await window.webContents.capturePage()).toPNG())
      })
      console.log(`Electron inspiration page smoke passed: ${phase}`)
      menuClick('退出')
      return
    }
    if (phase.startsWith('note-archive-')) {
      await noteArchiveSmoke({
        phase,
        main,
        note,
        js,
        click,
        input,
        waitFor,
        assert,
        dialog,
        state,
        capture: async (window, name) =>
          writeFileSync(resolve(output, name), (await window.webContents.capturePage()).toPNG())
      })
      console.log(`Electron note archive smoke passed: ${phase}`)
      menuClick('退出')
      return
    }
    if (phase.startsWith('topic-refinement-')) {
      await topicRefinementSmoke({ main, note, phase, js, click, input, waitFor })
      console.log(`Electron topic refinement smoke passed: ${phase}`)
      menuClick('退出')
      return
    }
    if (phase.startsWith('topic-management-')) {
      await waitFor(
        () => js(main, 'Boolean(document.querySelector(".workbench-header h1"))'),
        '工作台就绪'
      )
      await js(main, `document.querySelector('.workbench-nav [aria-label="小记"]').click()`)
      await js(
        main,
        `Array.from(document.querySelectorAll('.inspiration-views button')).find(x => x.textContent === '主题').click()`
      )
      if (phase === 'topic-management-create') {
        const createTopicHeight = await js(
          main,
          `document.querySelector('.inspiration-topic-create').getBoundingClientRect().height`
        )
        await click(main, '[aria-label="新增主题"]')
        assert.equal(
          await js(
            main,
            `document.querySelector('.inspiration-topic-create').getBoundingClientRect().height`
          ),
          createTopicHeight,
          '新建主题输入保持原入口高度'
        )
        writeFileSync(
          resolve(output, 'inspiration-topic-create.png'),
          (await main.webContents.capturePage()).toPNG()
        )
        await input(main, '[aria-label="新增主题名称"]', '临时输入', null)
        await js(
          main,
          `(() => {
          const form = document.querySelector('.inspiration-topic-form');
          const field = form.querySelector('input').getBoundingClientRect();
          for (const button of form.querySelectorAll(':scope > button')) {
            const rect = button.getBoundingClientRect();
            if (Math.abs(rect.top + rect.height / 2 - field.top - field.height / 2) > 0.5)
              throw new Error('主题操作按钮未垂直居中');
          }
        })()`
        )
        await click(main, '[aria-label="清除新增主题名称"]')
        assert.equal(
          await js(
            main,
            `(() => {
            const field = document.querySelector('[aria-label="新增主题名称"]');
            return field.value === '' && document.activeElement === field &&
              !document.querySelector('[aria-label="清除新增主题名称"]');
          })()`
          ),
          true,
          '单行输入清除后为空、保留焦点并隐藏清除按钮'
        )
        await input(main, '[aria-label="新增主题名称"]', '独立主题')
        await waitFor(
          () => js(main, `Boolean(document.querySelector('[aria-label="重命名独立主题"]'))`),
          '独立创建主题'
        )
        await click(main, '[aria-label="新增小记"]')
        await input(main, '[aria-label="新增小记内容"]', '切组前草稿', null)
        await click(main, '[aria-label="新增主题"]')
        await js(
          main,
          `document.querySelector('[aria-label="新增小记内容"]').dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))`
        )
        await input(main, '[aria-label="新增主题名称"]', '新主题', null)
        await js(main, `document.querySelector('[aria-label="新增主题名称"]').form.requestSubmit()`)
        await waitFor(
          () =>
            js(
              main,
              `document.querySelector('[aria-label="新增小记内容"]')?.value === '切组前草稿' && Boolean(document.querySelector('[aria-label="新增主题名称"]'))`
            ),
          '组合输入时保留草稿和当前主题'
        )
        await js(
          main,
          `document.querySelector('[aria-label="新增小记内容"]').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))`
        )
        await input(main, '[aria-label="新增主题名称"]', '新主题')
        await waitFor(
          () =>
            js(
              main,
              `document.querySelector('.inspiration-group-title')?.textContent === '新主题'`
            ),
          '创建主题后切组'
        )
        await click(main, '[aria-label="新增小记"]')
        for (const text of ['连续新增一', '连续新增二']) {
          await input(main, '[aria-label="新增小记内容"]', text)
          await waitFor(
            () => js(main, `document.querySelector('[aria-label="新增小记内容"]')?.value === ''`),
            `主题内保存${text}`
          )
        }
        const topicIdeas = (await js(main, 'window.myTodo.listInspirations()')).data
        const currentTopic = (await js(main, 'window.myTodo.listInspirationTopics()')).data.find(
          (topic) => topic.name === '新主题'
        )
        for (const text of ['连续新增一', '连续新增二']) {
          assert.deepEqual(topicIdeas.find((idea) => idea.description === text).topicIds, [
            currentTopic.id
          ])
        }
        const db = new DatabaseSync(resolve(process.env.MYTODO_SMOKE_DATA, 'mytodo.sqlite'))
        try {
          db.exec(
            `CREATE TRIGGER fail_inspiration BEFORE INSERT ON inspirations WHEN NEW.description = '失败后重试' BEGIN SELECT RAISE(ABORT, '测试保存失败'); END`
          )
          await input(main, '[aria-label="新增小记内容"]', '失败后重试')
          await waitFor(
            () => js(main, `document.body.textContent.includes('测试保存失败')`),
            '主题新增失败提示'
          )
          assert.equal(
            await js(main, `document.querySelector('[aria-label="新增小记内容"]').value`),
            '失败后重试'
          )
          db.exec('DROP TRIGGER fail_inspiration')
          await input(main, '[aria-label="新增小记内容"]', '失败后重试')
          await waitFor(
            () => js(main, `document.querySelector('[aria-label="新增小记内容"]')?.value === ''`),
            '主题新增失败后重试'
          )
        } finally {
          db.exec('DROP TRIGGER IF EXISTS fail_inspiration')
          db.close()
        }
        const retry = (await js(main, 'window.myTodo.listInspirations()')).data.filter(
          (i) => i.description === '失败后重试'
        )
        assert.equal(retry.length, 1)
        assert.deepEqual(retry[0].topicIds, [currentTopic.id])
        const archivedId = await js(
          main,
          `(async () => {
          const topic = (await window.myTodo.createInspirationTopic('归档持久主题')).data;
          const idea = (await window.myTodo.createInspiration('跨重启归档', topic.id)).data;
          await window.myTodo.appendInspiration(idea.id, '归档持久补充');
          await window.myTodo.archiveInspiration(idea.id);
          return idea.id;
        })()`
        )
        assert.ok(archivedId)
        const draft = (await js(main, 'window.myTodo.listInspirations()')).data.find(
          (idea) => idea.description === '切组前草稿'
        )
        const originalTopic = (await js(main, 'window.myTodo.listInspirationTopics()')).data.find(
          (topic) => topic.name === '独立主题'
        )
        assert.deepEqual(draft.topicIds, [originalTopic.id], '草稿保存在原主题')
        if (!(await js(main, `Boolean(document.querySelector('[aria-label="新增小记内容"]'))`)))
          await click(main, '[aria-label="新增小记"]')
        await input(main, '[aria-label="新增小记内容"]', '删除前草稿', null)
        await click(main, '[aria-label="删除新主题"]')
        await click(main, '[data-testid=delete-confirm]')
        await waitFor(
          () =>
            js(
              main,
              `document.querySelector('.inspiration-group-title')?.textContent === '未归类'`
            ),
          '删除当前主题后切组'
        )
        assert.ok(
          (await js(main, 'window.myTodo.listInspirations()')).data.some(
            (idea) => idea.description === '删除前草稿' && idea.topicIds.length === 0
          ),
          '删除主题前保存草稿'
        )
        const renameTopicHeight = await js(
          main,
          `document.querySelector('[aria-label="重命名独立主题"]').closest('.inspiration-nav-item').getBoundingClientRect().height`
        )
        await click(main, '[aria-label="重命名独立主题"]')
        assert.equal(
          await js(
            main,
            `document.querySelector('[aria-label="主题名称"]').closest('.inspiration-nav-item').getBoundingClientRect().height`
          ),
          renameTopicHeight,
          '修改主题名称保持分组项高度'
        )
        await click(main, '[aria-label="清除主题名称"]')
        assert.equal(
          await js(main, `document.querySelector('[aria-label="主题名称"]').value`),
          '',
          '重命名输入支持清除'
        )
        await input(main, '[aria-label="主题名称"]', '改名主题')
        await waitFor(
          () => js(main, `Boolean(document.querySelector('[aria-label="删除改名主题"]'))`),
          '主题改名'
        )
        const created = await js(
          main,
          `(async () => { const idea = (await window.myTodo.createInspiration('保留想法')).data; await window.myTodo.appendInspiration(idea.id, '保留补充'); const topics = (await window.myTodo.listInspirationTopics()).data; const topic = topics.find(t => t.name === '改名主题'); await window.myTodo.setInspirationTopic(idea.id, topic.id, true); await window.myTodo.createInspirationTopic('其他主题', idea.id); return idea.id })()`
        )
        await click(main, '[aria-label="删除改名主题"]')
        await waitFor(
          () => js(main, 'Boolean(document.querySelector("[role=alertdialog]"))'),
          '删除确认'
        )
        assert.match(
          await js(main, 'document.querySelector("[role=alertdialog]").textContent'),
          /2条小记/
        )
        await click(main, '[data-testid=delete-cancel]')
        assert.ok(
          (await js(note, 'window.myTodo.listInspirationTopics()')).data.some(
            (t) => t.name === '改名主题'
          )
        )
        await click(main, '[aria-label="删除改名主题"]')
        await click(main, '[data-testid=delete-confirm]')
        await waitFor(
          async () =>
            !(await js(note, 'window.myTodo.listInspirationTopics()')).data.some(
              (t) => t.name === '改名主题'
            ),
          '删除同步'
        )
        const idea = (await js(note, 'window.myTodo.listInspirations()')).data.find(
          (i) => i.id === created
        )
        assert.equal(idea.description, '保留想法')
        assert.equal(idea.additions[0].content, '保留补充')
        assert.equal(idea.topicIds.length, 1)
      } else {
        await js(
          main,
          `Array.from(document.querySelectorAll('.inspiration-views button')).find(x => x.textContent === '日期').click()`
        )
        await js(
          main,
          `Array.from(document.querySelectorAll('.inspiration-nav-item .inspiration-heading')).find(x => x.textContent === '已归档小记').click()`
        )
        await waitFor(
          () =>
            js(
              main,
              `document.querySelector('.inspiration-summary')?.textContent === '跨重启归档'`
            ),
          'Electron重启后归档可见'
        )
        assert.equal(
          await js(
            main,
            `Boolean(document.querySelector('.inspiration-detail, .inspiration-additions'))`
          ),
          false
        )
        assert.equal(
          (await js(main, `window.myTodo.listInspirationPage(0, 20, {kind:'archive'})`)).data
            .items[0].additions[0].content,
          '归档持久补充'
        )
        await click(main, '[aria-label="恢复小记"]')
        await waitFor(
          () => js(main, `!document.querySelector('.inspiration-item')`),
          '重启后恢复归档'
        )
        const restored = (await js(main, 'window.myTodo.listInspirations()')).data.find(
          (i) => i.description === '跨重启归档'
        )
        const archiveTopic = (await js(main, 'window.myTodo.listInspirationTopics()')).data.find(
          (t) => t.name === '归档持久主题'
        )
        assert.deepEqual(restored.topicIds, [archiveTopic.id], '重启后恢复主题关联')
        const topics = (await js(note, 'window.myTodo.listInspirationTopics()')).data
        assert.ok(topics.some((t) => t.name === '其他主题'))
        assert.ok(!topics.some((t) => t.name === '改名主题'))
        const idea = (await js(note, 'window.myTodo.listInspirations()')).data.find(
          (i) => i.description === '保留想法'
        )
        assert.equal(idea.additions[0].content, '保留补充')
        assert.equal(idea.topicIds.length, 1)
      }
      console.log(`Electron topic management smoke passed: ${phase}`)
      menuClick('退出')
      return
    }
    if (phase.startsWith('topics-')) {
      await waitFor(
        () => js(main, 'Boolean(document.querySelector(".workbench-header h1"))'),
        '工作台就绪'
      )
      await js(main, `document.querySelector('.workbench-nav [aria-label="小记"]').click()`)
      if (phase === 'topics-create') {
        await click(main, '[aria-label="新增小记"]')
        await input(main, '[aria-label="新增小记内容"]', '跨窗口主题小记')
        await waitFor(
          () =>
            js(
              main,
              `document.querySelector('[data-testid=inspiration-summary]')?.textContent.includes('跨窗口主题小记')`
            ),
          '小记创建'
        )
        await js(
          main,
          `Array.from(document.querySelectorAll('.inspiration-views button')).find(x => x.textContent === '日期').click()`
        )
        await waitFor(
          () =>
            js(main, `document.querySelector('.inspiration-group-title')?.textContent === '今天'`),
          '日期组持续显示归集中的记录'
        )
        await click(main, '[aria-label="归集主题"]')
        await createTopicAndReopen(main, '持久主题')
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
        await createTopicAndReopen(main, '另一个主题')
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
        await createTopicAndReopen(main, '持久主题二')
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
        await js(
          main,
          `(async () => { const idea = (await window.myTodo.listInspirations()).data[0]; await window.myTodo.appendInspiration(idea.id, '持久补充', 'topic-history') })()`
        )
        await waitFor(
          () =>
            js(
              note,
              `document.querySelector('[data-testid=note-inspiration-count]')?.textContent.trim() === '1'`
            ),
          '便签小记数量同步'
        )
        await js(
          note,
          `(async () => { const idea = (await window.myTodo.listInspirations()).data[0]; await window.myTodo.updateInspiration(idea.id, '双窗口更新') })()`
        )
        await waitFor(
          () =>
            js(
              main,
              `document.querySelector('.inspiration-summary')?.textContent === '双窗口更新'`
            ),
          '正文跨窗口同步'
        )
      } else {
        await waitFor(
          () =>
            js(
              main,
              `document.querySelector('.inspiration-group-title')?.textContent === '未归类'`
            ),
          '重启进入未归类'
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
        assert.equal(
          (await js(main, `window.myTodo.listInspirations()`)).data[0].additions[0].content,
          '持久补充',
          '重启后补充数据保留'
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
    if (phase === 'list-interaction') {
      await listInteractionSmoke({
        main,
        note,
        js,
        click,
        input,
        waitFor,
        capture: async (window, name) =>
          writeFileSync(resolve(output, name), (await window.webContents.capturePage()).toPNG())
      })
      console.log('Electron list interaction smoke passed')
      menuClick('退出')
      return
    }
    if (phase === 'workbench') {
      const captureDesign = async (filename) => {
        await js(
          main,
          'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
        )
        writeFileSync(resolve(output, filename), (await main.webContents.capturePage()).toPNG())
      }
      await waitFor(
        () => js(main, 'Boolean(document.querySelector(".workbench-header h1"))'),
        '工作台就绪'
      )
      assert.equal(
        await js(main, 'document.querySelector(".workbench-header h1").textContent'),
        '今天'
      )
      await js(
        main,
        `(async () => {
        const button = document.querySelector('.composer-toggle');
        const icon = button.querySelector('svg');
        const angle = () => {
          const matrix = new DOMMatrixReadOnly(getComputedStyle(icon).transform);
          return Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
        };
        const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
        for (const expanding of [true, false]) {
          button.click();
          await frame(); await frame();
          const animation = icon.getAnimations().find(item => item.transitionProperty === 'transform');
          if (!animation) throw new Error('新增图标缺少连续旋转过渡');
          await new Promise(resolve => setTimeout(resolve, 70));
          const middle = angle();
          if (middle <= 0 || middle >= 45) throw new Error('新增图标旋转方向或中间角度错误');
          await animation.finished;
          if (Math.abs(angle() - (expanding ? 45 : 0)) > 0.01) throw new Error('旋转结束角度错误');
        }
        const header = document.querySelector('.workbench-header');
        const width = header.getBoundingClientRect().width;
        const spacer = document.createElement('div');
        spacer.style.height = '200vh';
        document.querySelector('.workbench-main').append(spacer);
        try {
          await frame();
          if (document.scrollingElement.scrollHeight <= document.scrollingElement.clientHeight)
            throw new Error('未触发页面滚动');
          if (header.getBoundingClientRect().width !== width)
            throw new Error('页面滚动条出现后内容宽度变化');
        } finally { spacer.remove(); }
      })()`
      )
      assert.equal(
        await js(main, `document.querySelector('[data-testid=task-new]').checkVisibility()`),
        false
      )
      await click(main, '.primary-button')
      await waitFor(
        () => js(main, `document.activeElement.dataset.testid === 'task-new'`),
        '展开后聚焦任务输入'
      )
      await input(main, '[data-testid=task-new]', '任务待继续草稿', null)
      await click(main, '.primary-button')
      assert.equal(
        await js(main, `document.querySelector('[data-testid=task-new]').checkVisibility()`),
        false
      )
      await click(main, '.primary-button')
      assert.equal(
        await js(main, `document.querySelector('[data-testid=task-new]').value`),
        '任务待继续草稿',
        '任务新增切换展开收起并保留草稿'
      )
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
      main.focus()
      await js(main, `document.querySelector('[aria-label="更多操作：工作台任务"]').focus()`)
      main.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' })
      main.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Down' })
      await waitFor(
        () => js(main, `Boolean(document.querySelector('[role="menu"]'))`),
        '键盘打开任务操作菜单'
      )
      await captureDesign('workbench-task-menu.png')
      main.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
      main.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
      await waitFor(
        () =>
          js(
            main,
            `!document.querySelector('[role="menu"]') && document.activeElement?.getAttribute('aria-label') === '更多操作：工作台任务'`
          ),
        'Escape关闭菜单并返回操作按钮'
      )
      await js(main, `document.querySelector('[aria-label="更多操作：工作台任务"]').focus()`)
      main.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' })
      main.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Down' })
      await click(main, '[data-testid=task-details]')
      await click(main, '.detail-description')
      await input(main, '[data-testid=task-edit]', '更新工作台任务', null)
      await click(main, '.detail-back')
      await waitFor(
        async () => (await rows(note))[0].description === '更新工作台任务',
        '任务详情同步'
      )
      await click(main, '[data-task-id] input[type=checkbox]')
      await waitFor(async () => (await rows(note))[0].completed, '完成状态同步')
      await js(main, `document.querySelector('.workbench-nav [aria-label="习惯"]').click()`)
      await click(main, '.primary-button')
      await input(main, '[data-testid=habit-new]', '习惯待继续草稿', null)
      await click(main, '.primary-button')
      assert.equal(
        await js(main, `document.querySelector('[data-testid=habit-new]').checkVisibility()`),
        false
      )
      await click(main, '.primary-button')
      assert.equal(
        await js(main, `document.querySelector('[data-testid=habit-new]').value`),
        '习惯待继续草稿'
      )
      await input(main, '[data-testid=habit-new]', '每天检查')
      await waitFor(
        () =>
          js(
            main,
            'document.querySelector("[data-testid=habit-description]")?.textContent === "每天检查"'
          ),
        '习惯保存'
      )
      await waitFor(
        () => js(main, `document.activeElement?.dataset.testid === 'habit-new'`),
        '保存后保留习惯输入焦点，支持连续新增'
      )
      await js(main, `document.querySelector('.workbench-nav [aria-label="小记"]').click()`)
      writeFileSync(
        resolve(output, 'inspiration-new.png'),
        (await main.webContents.capturePage()).toPNG()
      )
      await click(main, '[aria-label="新增小记"]')
      await input(main, '[aria-label="新增小记内容"]', '待继续的草稿', null)
      await click(main, '[aria-label="新增小记"]')
      assert.equal(
        await js(main, `Boolean(document.querySelector('[aria-label="新增小记内容"]'))`),
        false,
        '再次点击加号收起小记输入框'
      )
      await click(main, '[aria-label="新增小记"]')
      assert.equal(
        await js(main, `document.querySelector('[aria-label="新增小记内容"]').value`),
        '待继续的草稿',
        '收起后展开保留小记草稿'
      )
      await input(main, '[aria-label="新增小记内容"]', '新的小记')
      await waitFor(
        () =>
          js(
            main,
            `document.querySelector('[data-testid=inspiration-summary]')?.textContent === '新的小记'`
          ),
        '页内新增小记'
      )
      assert.equal(
        await js(main, `document.activeElement?.getAttribute('aria-label')`),
        '新增小记内容',
        '新增小记后保持输入焦点'
      )
      const inspirationRowHeight = await js(
        main,
        `document.querySelector('.inspiration-row').getBoundingClientRect().height`
      )
      await click(main, '[data-testid=inspiration-summary]')
      assert.equal(
        await js(main, `document.querySelector('.inspiration-row').getBoundingClientRect().height`),
        inspirationRowHeight,
        '进入编辑保持小记行高'
      )
      assert.equal(
        await js(
          main,
          `(() => { const field = document.querySelector('[data-testid=inspiration-edit]'); return document.activeElement === field && field.selectionStart === field.value.length && field.selectionEnd === field.value.length })()`
        ),
        true,
        '进入小记编辑时光标位于内容末尾'
      )
      await input(main, '[data-testid=inspiration-edit]', '编辑后的小记', null)
      await js(
        main,
        `document.querySelector('[data-testid=inspiration-edit]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))`
      )
      assert.equal(
        await js(main, `Boolean(document.querySelector('[data-testid=inspiration-edit]'))`),
        true,
        '输入法确认不提交'
      )
      main.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter', modifiers: ['control'] })
      main.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter', modifiers: ['control'] })
      await waitFor(
        () =>
          js(
            main,
            `document.querySelector('[data-testid=inspiration-edit]')?.value === ${JSON.stringify('编辑后的小记\n')}`
          ),
        'Ctrl+Enter在编辑内容中换行'
      )
      await main.webContents.insertText('保留下一行')
      assert.ok(
        (await js(
          main,
          `document.querySelector('.inspiration-row').getBoundingClientRect().height`
        )) > inspirationRowHeight,
        '编辑换行时自动增高小记输入框'
      )
      await captureDesign('inspiration-inline-edit.png')
      main.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
      main.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
      await waitFor(
        () => js(main, `!document.querySelector('[data-testid=inspiration-edit]')`),
        'Enter确认编辑并退出'
      )
      await captureDesign('inspiration-row-layout.png')
      await js(
        main,
        `(() => {
        const row = document.querySelector('.inspiration-row');
        const summary = row.querySelector('.inspiration-summary').getBoundingClientRect();
        const actions = Array.from(row.querySelectorAll('.inspiration-row-actions button')).map(x => x.getBoundingClientRect());
        if (actions.length !== 2 || actions.some(x => x.left < summary.right || Math.abs(x.top - actions[0].top) > 1)) throw new Error('小记操作未在右端同一行');
      })()`
      )
      await captureDesign('inspiration-row-layout.png')
      assert.equal(
        (await js(main, `window.myTodo.listInspirations()`)).data[0].description,
        '编辑后的小记\n保留下一行'
      )
      assert.equal(
        await js(
          main,
          `Boolean(document.querySelector('.inspiration-detail, [data-testid=inspiration-supplement]'))`
        ),
        false
      )
      main.setContentSize(600, 700)
      writeFileSync(
        resolve(output, 'workbench-narrow.png'),
        (await main.webContents.capturePage()).toPNG()
      )
      await js(
        main,
        `Array.from(document.querySelectorAll('.inspiration-views button')).find(x => x.textContent === '日期').click()`
      )
      await waitFor(
        () =>
          js(main, `document.querySelector('.inspiration-group-title')?.textContent === '今天'`),
        '日期组持续显示归集中的记录'
      )
      await click(main, '[aria-label="归集主题"]')
      await createTopicAndReopen(main, '产品构想')
      await waitFor(
        () =>
          js(
            main,
            `document.querySelector('.inspiration-topic-picker')?.textContent.includes('产品构想')`
          ),
        '主题创建'
      )
      await createTopicAndReopen(main, '工作流')
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
      assert.equal(
        await js(
          main,
          `document.querySelector('.inspiration-nav-item .inspiration-heading').textContent`
        ),
        '未归类',
        '未归类排在第一项'
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
      await chooseGroup('工作流')
      await waitFor(
        () =>
          js(
            main,
            `!document.querySelector('.inspiration-detail') && Boolean(document.querySelector('[data-inspiration-id]'))`
          ),
        '切组保留列表'
      )
      await chooseView('日期')
      await waitFor(
        () =>
          js(main, `document.querySelector('.inspiration-group-title')?.textContent === '今天'`),
        '返回日期'
      )
      main.setContentSize(1280, 800)
      await chooseView('主题')
      await waitFor(
        () =>
          js(
            main,
            `document.querySelector('.inspiration-group-title')?.textContent === '工作流' && !document.querySelector('.inspiration-detail')`
          ),
        '恢复主题组及列表'
      )
      writeFileSync(
        resolve(output, 'inspiration-topic-list.png'),
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
      await js(
        main,
        `(() => {
        for (const selector of ['.inspiration-navigation', '.inspiration-list']) {
          const element = document.querySelector(selector);
          const width = element.clientWidth;
          const overflow = element.style.overflowY;
          element.style.overflowY = 'scroll';
          try {
            if (element.clientWidth !== width) throw new Error(selector + '滚动条改变了可用宽度');
          } finally { element.style.overflowY = overflow; }
        }
      })()`
      )
      const localDate = (daysAgo) => {
        const date = new Date()
        date.setDate(date.getDate() - daysAgo)
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      }
      assert.deepEqual(headings, [
        '今天',
        ...Array.from({ length: 6 }, (_, i) => localDate(i + 1)),
        '历史小记',
        '已归档小记'
      ])
      await js(
        main,
        `(async () => { for (let i = 0; i < 25; i++) { const result = await window.myTodo.createInspiration('分页小记 ' + String(i).padStart(2, '0')); if (!result.ok) throw new Error('创建小记失败'); } })()`
      )
      await waitFor(
        () => js(main, `document.querySelectorAll('.inspiration-item').length === 20`),
        '当前组首页'
      )
      assert.equal(
        await js(
          main,
          `document.scrollingElement.scrollHeight <= document.scrollingElement.clientHeight`
        ),
        true,
        '小记页不出现整页滚动条'
      )
      assert.equal(
        await js(
          main,
          `(() => { const list = document.querySelector('.inspiration-list'); return list.scrollHeight > list.clientHeight })()`
        ),
        true,
        '长小记列表在内容区独立滚动'
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
      const topicScroll = await js(main, `document.querySelector('.inspiration-list').scrollTop`)
      assert.ok(topicScroll > 0, '主题列表可滚动')
      await chooseView('日期')
      await waitFor(
        () =>
          js(main, `document.querySelector('.inspiration-group-title')?.textContent === '今天'`),
        '切到日期视角'
      )
      await chooseView('主题')
      await waitFor(
        () =>
          js(
            main,
            `document.querySelector('.inspiration-group-title')?.textContent === '工作流' && document.querySelector('.inspiration-list').scrollTop > 0`
          ),
        '恢复主题滚动位置'
      )
      assert.equal(
        await js(main, `document.querySelector('.inspiration-list').scrollTop`),
        topicScroll
      )
      await js(
        main,
        `(() => {
        const headings = Array.from(document.querySelectorAll('.inspiration-nav-item .inspiration-heading'));
        headings.find(x => x.textContent === '产品构想').click();
        headings.find(x => x.textContent === '工作流').click();
      })()`
      )
      await waitFor(
        () =>
          js(
            main,
            `document.querySelector('.inspiration-group-title')?.textContent === '工作流' && document.querySelectorAll('.inspiration-item').length === 26`
          ),
        '快速切组显示最后选择的主题'
      )
      await js(
        main,
        `document.querySelector('.inspiration-list').scrollTop = document.querySelector('.inspiration-list').scrollHeight`
      )
      await waitFor(
        () => js(main, `document.querySelectorAll('.inspiration-item').length === 26`),
        '快速切组后分页'
      )
      await click(main, '[aria-label="归档小记"]')
      await waitFor(
        () => js(main, `document.querySelectorAll('.inspiration-item').length === 25`),
        '归档移出主题'
      )
      await chooseView('日期')
      await chooseGroup('已归档小记')
      await waitFor(
        () => js(main, `document.querySelectorAll('.inspiration-item').length === 1`),
        '归档区显示'
      )
      assert.equal(
        await js(
          main,
          `Boolean(document.querySelector('[aria-label="新增小记"], [aria-label="归集主题"], [aria-label="归档小记"]'))`
        ),
        false
      )
      await click(main, '.inspiration-summary')
      await waitFor(
        () => js(main, `!document.querySelector('.inspiration-detail')`),
        '归档保持列表且没有详情'
      )
      assert.equal(
        await js(main, `Boolean(document.querySelector('[data-testid=inspiration-addition]'))`),
        false
      )
      writeFileSync(
        resolve(output, 'inspiration-archive.png'),
        (await main.webContents.capturePage()).toPNG()
      )
      const previousBounds = main.getBounds()
      main.setSize(800, previousBounds.height)
      await new Promise((resolveWait) => setTimeout(resolveWait, 200))
      writeFileSync(
        resolve(output, 'inspiration-archive-narrow.png'),
        (await main.webContents.capturePage()).toPNG()
      )
      main.setBounds(previousBounds)
      await click(main, '[aria-label="恢复小记"]')
      await waitFor(
        () => js(main, `document.querySelectorAll('.inspiration-item').length === 0`),
        '恢复后离开归档区'
      )
      await chooseView('主题')
      await waitFor(
        () => js(main, `document.querySelectorAll('.inspiration-item').length === 26`),
        '恢复主题关联'
      )
      await click(main, '[aria-label="归档小记"]')
      await chooseView('日期')
      await waitFor(
        () => js(main, `document.querySelectorAll('.inspiration-item').length === 1`),
        '再次归档'
      )
      await click(main, '[aria-label="永久删除小记"]')
      await click(main, '[data-testid=delete-cancel]')
      assert.equal(await js(main, `document.querySelectorAll('.inspiration-item').length`), 1)
      await click(main, '[aria-label="永久删除小记"]')
      await click(main, '[data-testid=delete-confirm]')
      await waitFor(
        () => js(main, `document.querySelectorAll('.inspiration-item').length === 0`),
        '确认永久删除'
      )
      await click(main, '[data-testid=open-settings]')
      assert.equal(
        await js(main, 'document.querySelector(".workbench-header h1").textContent'),
        '设置'
      )
      await captureDesign('workbench-settings.png')
      await click(main, '[aria-label="习惯"]')
      await waitFor(
        () => js(main, `document.querySelector('.workbench-header h1').textContent === '习惯'`),
        '习惯页面就绪'
      )
      await captureDesign('workbench-habits.png')
      await js(
        main,
        `(async () => {
        await window.myTodo.createTask('整理本周的项目进展');
        await window.myTodo.createTask('确认下一个版本的交互细节');
        const result = await window.myTodo.createTask('完善个人工作台');
        if (result.ok) {
          await window.myTodo.convertToMultiDay(result.data.id);
          await window.myTodo.setTaskProgress(result.data.id, 45);
        }
      })()`
      )
      await click(main, '[aria-label="任务"]')
      await waitFor(
        () => js(main, `document.querySelector('.workbench-header h1').textContent === '今天'`),
        '任务页面就绪'
      )
      await waitFor(
        () => js(main, `document.querySelectorAll('[data-task-id]').length >= 5`),
        '任务工作台完整状态'
      )
      await captureDesign('workbench-overview.png')
      assert.equal(
        await js(
          main,
          `(() => {
        const row = document.querySelector('[data-task-kind="multi-day"]');
        const description = row.querySelector('[data-testid="task-description"]').getBoundingClientRect();
        return description.width > 180 && description.height < 60 && row.getBoundingClientRect().right <= innerWidth;
      })()`
        ),
        true,
        '多天任务分组标题不挤压正文'
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
          '小记数量跨窗口同步'
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
        if (window === note) {
          await click(other, '[data-testid=task-description]')
          await click(window, '[data-testid=task-delete]')
          await count(other, 1)
          assert.equal(
            await js(note, 'Boolean(document.querySelector("[role=alertdialog]"))'),
            false,
            '便签归档直接执行'
          )
        } else {
          await click(window, '[data-testid=task-delete]')
          await click(window, '[data-testid=delete-cancel]')
          await count(other, 2)
          await click(other, '[data-testid=task-description]')
          await click(window, '[data-testid=task-delete]')
          await click(window, '[data-testid=delete-confirm]')
          await count(other, 1)
        }
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

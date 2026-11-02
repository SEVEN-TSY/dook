import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export async function topicRefinementSmoke({ main, note, phase, js, click, input, waitFor }) {
  await click(main, '.workbench-nav [aria-label="小记"]')
  await js(
    main,
    `Array.from(document.querySelectorAll('.inspiration-views button')).find(x => x.textContent === '主题').click()`
  )
  await waitFor(
    () => js(main, `Boolean(document.querySelector('[aria-label="新增主题"]'))`),
    '主题导航'
  )
  if (phase.endsWith('restart')) {
    const topics = (await js(note, 'window.myTodo.listInspirationTopics()')).data
    assert.ok(topics.some((topic) => topic.name === '持久主题甲'))
    assert.ok(topics.some((topic) => topic.name === '归集新增主题'))
    const idea = (await js(note, 'window.myTodo.listInspirations()')).data.find(
      (item) => item.description === '待归集小记'
    )
    assert.equal(idea.topicIds.length, 3, '归集及改名跨重启持久化')
    return
  }
  assert.equal(
    await js(
      main,
      `(() => { const button = document.querySelector('[aria-label="新增主题"]'); return button.closest('.inspiration-nav-item')?.querySelector('.inspiration-heading')?.textContent === '无归类' && button.textContent.trim() === '' && button.title === '新增主题' })()`
    ),
    true,
    '无归类右侧仅显示可访问的新增主题加号'
  )
  main.focus()
  await js(main, `document.querySelector('[aria-label="新增主题"]').focus()`)
  main.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
  main.webContents.sendInputEvent({ type: 'char', keyCode: 'Enter' })
  main.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
  await input(main, '[aria-label="新增主题名称"]', '放弃的主题', null)
  await js(
    main,
    `document.querySelector('.inspiration-group-title').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`
  )
  assert.equal(
    await js(main, `Boolean(document.querySelector('[aria-label="新增主题名称"]'))`),
    false,
    '新建主题点击外部取消'
  )
  await click(main, '[aria-label="新增主题"]')
  await input(main, '[aria-label="新增主题名称"]', '待清除', null)
  await click(main, '[aria-label="清除新增主题名称"]')
  assert.equal(
    await js(
      main,
      `document.activeElement?.getAttribute('aria-label') === '新增主题名称' && document.activeElement.value === ''`
    ),
    true
  )
  await input(main, '[aria-label="新增主题名称"]', '持久主题甲', null)
  await click(main, '[aria-label="创建主题"]')
  await waitFor(
    () => js(main, `Boolean(document.querySelector('[aria-label="重命名持久主题甲"]'))`),
    '内部确认正常创建'
  )
  await click(main, '[aria-label="重命名持久主题甲"]')
  await input(main, '[aria-label="主题名称"]', '待清除改名', null)
  await click(main, '[aria-label="清除主题名称"]')
  assert.equal(
    await js(
      main,
      `document.activeElement?.getAttribute('aria-label') === '主题名称' && document.activeElement.value === ''`
    ),
    true,
    '改名清除视为内部操作且保持焦点'
  )
  await input(main, '[aria-label="主题名称"]', '持久主题甲', null)
  await click(main, '[aria-label="保存主题名称"]')
  await waitFor(
    () => js(main, `!document.querySelector('[aria-label="主题名称"]')`),
    '改名确认保存'
  )
  await click(main, '[aria-label="重命名持久主题甲"]')
  await input(main, '[aria-label="主题名称"]', '未确认改名', null)
  await js(
    main,
    `document.querySelector('.inspiration-group-title').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`
  )
  assert.equal(
    await js(main, `Boolean(document.querySelector('[aria-label="主题名称"]'))`),
    false,
    '改名点击外部取消'
  )
  assert.ok(
    (await js(note, 'window.myTodo.listInspirationTopics()')).data.some(
      (topic) => topic.name === '持久主题甲'
    )
  )
  await js(
    note,
    `(async () => { await window.myTodo.createInspirationTopic('持久主题乙'); await window.myTodo.createInspiration('待归集小记') })()`
  )
  await js(
    main,
    `Array.from(document.querySelectorAll('.inspiration-nav-item .inspiration-heading')).find(x => x.textContent === '无归类').click()`
  )
  await click(main, '[aria-label="归集主题"]')
  assert.equal(
    await js(main, `Boolean(document.querySelector('[aria-label="关闭主题归集"]'))`),
    true,
    '归集浮层具有可访问关闭入口'
  )
  assert.equal(
    await js(main, `document.querySelector('.inspiration-topic-picker label').textContent.trim()`),
    '持久主题乙',
    '新建主题在归集列表最上面'
  )
  await click(main, '.inspiration-topic-picker input[type=checkbox]')
  await waitFor(
    () =>
      js(
        main,
        `!document.querySelector('[data-inspiration-id]') && Boolean(document.querySelector('.inspiration-topic-picker'))`
      ),
    '归集立即刷新无归类且浮层保持开启'
  )
  await js(
    main,
    `Array.from(document.querySelectorAll('.inspiration-topic-picker label')).find(x => x.textContent.includes('持久主题甲')).querySelector('input').click()`
  )
  await waitFor(
    async () => (await js(note, 'window.myTodo.listInspirations()')).data[0].topicIds.length === 2,
    '连续多主题同步另一窗口'
  )
  await input(main, '[aria-label="搜索主题"]', '主题乙', null)
  assert.deepEqual(
    await js(
      main,
      `(() => {
      const style = getComputedStyle(document.querySelector('[aria-label="清除搜索主题"]'));
      return [style.width, style.height, style.borderRadius, style.padding];
    })()`
    ),
    ['14px', '14px', '50%', '0px'],
    '归集浮层复用圆形清除按钮，不受旧按钮样式覆盖'
  )
  const originalScheme = await js(main, `document.documentElement.style.colorScheme`)
  main.webContents.debugger.attach('1.3')
  try {
    await main.webContents.debugger.sendCommand('DOM.enable')
    await main.webContents.debugger.sendCommand('CSS.enable')
    const { root } = await main.webContents.debugger.sendCommand('DOM.getDocument')
    const { nodeId } = await main.webContents.debugger.sendCommand('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: '[aria-label="清除搜索主题"]'
    })
    await js(main, `document.documentElement.style.colorScheme = 'dark'`)
    await main.webContents.debugger.sendCommand('CSS.forcePseudoState', {
      nodeId,
      forcedPseudoClasses: ['hover']
    })
    assert.equal(
      await js(
        main,
        `getComputedStyle(document.querySelector('[aria-label="清除搜索主题"]')).backgroundColor`
      ),
      'rgb(58, 58, 58)',
      '深色清除按钮悬停使用中性灰背景'
    )
  } finally {
    main.webContents.debugger.detach()
    await js(main, `document.documentElement.style.colorScheme = ${JSON.stringify(originalScheme)}`)
  }
  assert.equal(
    await js(
      main,
      `document.querySelectorAll('.inspiration-topic-picker input[type=checkbox]').length`
    ),
    1,
    '搜索已有主题'
  )
  await input(main, '[aria-label="搜索主题"]', '', null)
  assert.equal(
    await js(main, `document.querySelector('[aria-label="创建并归集"]').disabled`),
    true,
    '空主题名称禁用回车按钮'
  )
  await input(main, '[aria-label="新主题名称"]', '   ')
  await js(main, `document.querySelector('[aria-label="新主题名称"]').form.requestSubmit()`)
  assert.equal(
    await js(
      main,
      `document.querySelector('[aria-label="创建并归集"]').disabled && !document.querySelector('.inspiration-topic-picker [role=alert]')`
    ),
    true,
    '纯空格禁用按钮并拦截表单提交'
  )
  assert.equal(
    await js(main, `document.querySelector('[aria-label="新主题名称"]').value`),
    '   ',
    '空白提交保留输入'
  )
  await input(main, '[aria-label="新主题名称"]', '关闭丢弃', null)
  await click(main, '[aria-label="关闭主题归集"]')
  assert.equal(
    await js(main, `Boolean(document.querySelector('.inspiration-topic-picker'))`),
    false
  )
  assert.equal(
    (await js(note, 'window.myTodo.listInspirations()')).data[0].topicIds.length,
    2,
    '关闭不回滚已保存的勾选'
  )
  await js(
    main,
    `Array.from(document.querySelectorAll('.inspiration-nav-item .inspiration-heading')).find(x => x.textContent === '持久主题甲').click()`
  )
  await click(main, '[aria-label="归集主题"]')
  assert.equal(
    await js(main, `document.querySelector('[aria-label="新主题名称"]').value`),
    '',
    '重新打开丢弃未提交草稿'
  )
  assert.equal(
    await js(
      main,
      `document.querySelector('[aria-label="归集主题"]').getAttribute('aria-expanded')`
    ),
    'true',
    '触发按钮保留展开状态'
  )
  await input(main, '[aria-label="新主题名称"]', '归集新增主题', null)
  await click(main, '[aria-label="创建并归集"]')
  await waitFor(
    () => js(main, `!document.querySelector('.inspiration-topic-picker')`),
    '回车图标创建并归集成功关闭'
  )
  await click(main, '[aria-label="归集主题"]')
  await input(main, '[aria-label="新主题名称"]', 'Esc放弃', null)
  main.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  main.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
  await waitFor(
    () => js(main, `!document.querySelector('.inspiration-topic-picker')`),
    'Esc关闭浮层'
  )
  await click(main, '[aria-label="归集主题"]')
  await js(
    main,
    'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
  )
  await js(
    main,
    `document.querySelector('.inspiration-group-title').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0 }))`
  )
  await waitFor(
    () => js(main, `!document.querySelector('.inspiration-topic-picker')`),
    '外部点击关闭浮层'
  )
  await click(main, '[aria-label="归集主题"]')
  await input(main, '[aria-label="新主题名称"]', '较早创建', null)
  await js(
    main,
    `(() => { const field = document.querySelector('[aria-label="新主题名称"]'); field.form.requestSubmit(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, '较新草稿'); field.dispatchEvent(new Event('input', { bubbles: true })); })()`
  )
  await waitFor(
    async () =>
      (await js(note, 'window.myTodo.listInspirationTopics()')).data.some(
        (item) => item.name === '较早创建'
      ),
    '较早创建完成'
  )
  assert.equal(
    await js(main, `document.querySelector('[aria-label="新主题名称"]')?.value`),
    '较新草稿',
    '异步创建不关闭或清空较新草稿'
  )
  // 删除测试中的额外归集，重启阶段只需验证前三个持久主题。
  await js(
    note,
    `(async () => { const topic = (await window.myTodo.listInspirationTopics()).data.find(x => x.name === '较早创建'); const idea = (await window.myTodo.listInspirations()).data[0]; await window.myTodo.setInspirationTopic(idea.id, topic.id, false) })()`
  )
  await waitFor(
    () =>
      js(
        main,
        `document.querySelectorAll('.inspiration-topic-picker input[type=checkbox]:checked').length === 3`
      ),
    '跨窗口归集变更同步浮层'
  )
  const output = resolve('.local/smoke')
  mkdirSync(output, { recursive: true })
  writeFileSync(
    resolve(output, 'topic-refinement-normal.png'),
    (await main.webContents.capturePage()).toPNG()
  )
  const bounds = main.getBounds()
  main.setSize(860, bounds.height)
  await js(
    main,
    'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
  )
  writeFileSync(
    resolve(output, 'topic-refinement-narrow.png'),
    (await main.webContents.capturePage()).toPNG()
  )
  const layout = await js(
    main,
    `(() => { const el = document.querySelector('.inspiration-topic-picker'); const rect = el.getBoundingClientRect(); return { width: rect.width, left: rect.left, right: rect.right, viewport: innerWidth, cssWidth: getComputedStyle(el).width, sizing: getComputedStyle(el).boxSizing, rootWindow: document.documentElement.dataset.window } })()`
  )
  assert.ok(
    layout.width < 260 && layout.left >= 0 && layout.right <= layout.viewport,
    `窄窗口浮层紧凑且保持可见：${JSON.stringify(layout)}`
  )
}

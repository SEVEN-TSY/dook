export async function taskInlineSmoke({
  phase,
  main,
  note,
  js,
  click,
  input,
  waitFor,
  assert,
  capture
}) {
  const tasks = async () => (await js(note, 'window.myTodo.listToday()')).data.tasks
  const get = async (id) => (await tasks()).find((t) => t.id === id)
  const row = (id) => `[data-task-id="${id}"]`
  const menu = async (id) => {
    await waitFor(
      () => js(main, `Boolean(document.querySelector('${row(id)} .task-more:not(:disabled)'))`),
      '任务菜单就绪'
    )
    main.focus()
    await js(main, `document.querySelector('${row(id)} .task-more').focus()`)
    main.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' })
    main.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Down' })
    await waitFor(() => js(main, `Boolean(document.querySelector('[role=menu]'))`), '打开菜单')
  }
  const action = async (text) => {
    await js(
      main,
      `Array.from(document.querySelectorAll('[role=menuitem]')).find(x=>x.textContent.trim()===${JSON.stringify(text)}).click()`
    )
  }
  if (phase.endsWith('restart')) {
    const saved = (await tasks()).find((t) => t.description === '新版行内验收')
    const ordered = (await tasks()).find((t) => t.description === '排序重启')
    assert.deepEqual(
      ordered.subitems.map((item) => item.description),
      ['后项', '前项']
    )
    assert.ok(saved.updatedAt)
    assert.equal(saved.kind, 'today')
    assert.equal(saved.subitems?.length ?? 0, 0)
    assert.equal(await js(main, `document.querySelectorAll('.subitems-panel').length`), 0)
    return
  }
  const task = (await js(note, `window.myTodo.createTask('新版行内验收')`)).data
  await menu(task.id)
  await action('转为持续推进')
  await waitFor(async () => (await get(task.id)).kind === 'multi-day', '转换')
  assert.equal(
    await js(main, `document.querySelectorAll('.subitems-panel').length`),
    0,
    '无子事项无展开'
  )
  for (const value of [0, 25, 50, 75, 100, 25]) {
    const before = (await get(task.id)).progress
    await input(main, `${row(task.id)} input[type=range]`, String(value), null)
    assert.equal((await get(task.id)).progress, before, '拖动预览不保存')
    await js(
      main,
      `document.querySelector('${row(task.id)} input[type=range]').dispatchEvent(new PointerEvent('pointerup', {bubbles:true,pointerId:1}))`
    )
    await waitFor(async () => (await get(task.id)).progress === value, '五档进度')
  }
  await menu(task.id)
  await action('转回这就去做')
  await waitFor(async () => (await get(task.id)).kind === 'today', '转回当天')
  await menu(task.id)
  assert.equal(
    await js(
      main,
      `Array.from(document.querySelectorAll('[role=menuitem]')).some(x=>x.textContent.includes('添加子事项'))`
    ),
    false
  )
  main.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  main.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
  await js(note, `window.myTodo.addSubitem('${task.id}', '第一项')`)
  await js(note, `window.myTodo.addSubitem('${task.id}', '第二项')`)
  await waitFor(
    () => js(main, `Boolean(document.querySelector('${row(task.id)} .task-expand'))`),
    '子事项同步'
  )
  await click(main, `${row(task.id)} .task-expand`)
  await waitFor(
    () => js(main, `document.activeElement?.dataset.testid === 'subitem-new'`),
    '加号展开并聚焦新增框'
  )
  assert.equal(
    await js(
      main,
      `document.querySelector('${row(task.id)} .task-subitems-action').getAttribute('aria-expanded')`
    ),
    'true'
  )
  await click(main, `${row(task.id)} .task-expand`)
  await waitFor(() => js(main, `!document.querySelector('.subitems-panel')`), '折叠')
  await click(main, `${row(task.id)} .task-progress-summary`)
  await waitFor(
    () => js(main, `Boolean(document.querySelector('.subitems-panel'))`),
    '整个进度摘要展开'
  )
  await click(main, '[data-testid=subitem-description]')
  await waitFor(
    () => js(main, `document.querySelector('[data-testid=subitem-edit]')?.tagName === 'TEXTAREA'`),
    '子事项复用正文编辑样式'
  )
  assert.equal(
    await js(main, `document.querySelector('[data-testid=subitem-new]').checkVisibility()`),
    true,
    '编辑时保留新增框'
  )
  assert.equal(
    await js(main, `document.querySelector('[data-testid=subitem-new]').value`),
    '',
    '新增与编辑草稿独立'
  )
  await input(main, '[data-testid=subitem-edit]', '子事项编辑\n第二行')
  await waitFor(
    async () => (await get(task.id)).subitems[0].description === '子事项编辑\n第二行',
    '子事项多行保存'
  )
  await capture(main, 'task-inline-refined.png')
  await menu(task.id)
  await action('转回这就去做')
  await waitFor(
    () => js(main, `Boolean(document.querySelector('[role=alertdialog]'))`),
    '子事项丢失确认'
  )
  assert.match(
    await js(main, `document.querySelector('[role=alertdialog]').textContent`),
    /丢失所有子事项/
  )
  await click(main, '[data-testid=delete-cancel]')
  assert.equal((await get(task.id)).subitems.length, 2, '取消保留子事项')
  await menu(task.id)
  await action('转回这就去做')
  await click(main, '[data-testid=delete-confirm]')
  await waitFor(async () => (await get(task.id)).kind === 'today', '确认转回当天')
  assert.equal((await get(task.id)).subitems?.length ?? 0, 0, '确认移除全部子事项')
  const ordered = (await js(note, `window.myTodo.createTask('排序重启')`)).data
  await js(note, `window.myTodo.addSubitem('${ordered.id}', '前项')`)
  await js(note, `window.myTodo.addSubitem('${ordered.id}', '后项')`)
  await waitFor(
    () => js(main, `Boolean(document.querySelector('${row(ordered.id)} .task-subitems-action'))`),
    '排序任务同步'
  )
  await click(main, `${row(ordered.id)} .task-subitems-action`)
  await waitFor(
    () => js(main, `document.querySelectorAll('[data-subitem-id]').length === 2`),
    '子事项显示'
  )
  await js(
    main,
    `(() => {
    const rows = document.querySelectorAll('[data-subitem-id]'); const target = rows[0]; const source = rows[1];
    const transfer = new DataTransfer();
    source.querySelector('.subitem-drag').dispatchEvent(new DragEvent('dragstart', {bubbles:true, dataTransfer:transfer}));
  })()`
  )
  await js(
    main,
    `(() => {const target=document.querySelector('[data-subitem-id]'); const bounds=target.getBoundingClientRect();target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,clientY:bounds.top+1}));})()`
  )
  await js(
    main,
    `document.querySelector('[data-subitem-id]').dispatchEvent(new DragEvent('drop', {bubbles:true,cancelable:true}))`
  )
  await waitFor(
    async () => (await get(ordered.id)).subitems[0].description === '后项',
    '拖动排序同步到另一窗口'
  )
  await waitFor(
    () =>
      js(
        main,
        `document.querySelector('[data-subitem-id] [data-testid=subitem-description]').textContent.trim() === '后项'`
      ),
    '列表顺序更新'
  )
}

export async function noteArchiveSmoke({
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
  capture
}) {
  const tasks = async () => (await js(note, 'window.myTodo.listToday()')).data.tasks
  const archived = async () => (await js(note, 'window.myTodo.listArchivedTasks()')).data
  const themePaint = async () => {
    const point = await js(
      main,
      `(() => { const rect = document.querySelector('[aria-label="任务"]').getBoundingClientRect(); return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) } })()`
    )
    main.focus()
    main.webContents.sendInputEvent({ type: 'mouseMove', ...point })
    const mainPaint = await js(
      main,
      `(async () => {
      const field = document.querySelector('[aria-label="主题色十六进制值"]');
      field.blur();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const border = getComputedStyle(field).borderColor;
      const hover = getComputedStyle(document.querySelector('[aria-label="任务"]')).backgroundColor;
      field.focus();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const focus = getComputedStyle(field).borderColor;
      field.blur();
      return { border, hover, focus };
    })()`
    )
    const notePoint = await js(
      note,
      `(() => { const rect = document.querySelector('[data-testid="note-settings"]').getBoundingClientRect(); return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) } })()`
    )
    note.focus()
    note.webContents.sendInputEvent({ type: 'mouseMove', ...notePoint })
    const noteButtonHover = await js(
      note,
      `(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const button = document.querySelector('[data-testid="note-settings"]');
      if (!button.matches(':hover')) throw new Error('便签设置按钮未进入真实悬停状态');
      return getComputedStyle(button).backgroundColor;
    })()`
    )
    return { ...mainPaint, noteButtonHover }
  }
  const keyboardActivate = async (selector) => {
    await waitFor(
      () =>
        js(
          note,
          `Boolean(document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled)`
        ),
      '键盘操作就绪'
    )
    note.focus()
    await js(note, `document.querySelector(${JSON.stringify(selector)}).focus()`)
    note.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
    note.webContents.sendInputEvent({ type: 'char', keyCode: 'Enter' })
    note.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
  }
  const visibleGroups = () =>
    js(
      note,
      `Array.from(document.querySelectorAll('[data-note-group]')).filter(x => x.getClientRects().length).map(x => x.dataset.noteGroup)`
    )
  await waitFor(
    () => js(main, 'Boolean(document.querySelector(".workbench-header h1"))'),
    '主界面就绪'
  )
  if (phase.endsWith('restart')) {
    assert.equal((await state(note)).settings.showMultiDay, false, '重启保留分栏设置')
    assert.equal((await state(note)).settings.themeColor, '#467a63', '重启保留自定义主题色')
    await waitFor(
      () =>
        js(note, `document.documentElement.style.getPropertyValue('--app-accent') === '#467a63'`),
      '便签重启应用主题色'
    )
    assert.deepEqual(await visibleGroups(), ['archived'])
    const saved = (await archived()).find((x) => x.description === '保留归档任务')
    assert.ok(saved, '归档任务重启保留')
    await click(note, '[data-note-group=archived]')
    await click(note, `[aria-label="恢复：${saved.description}"]`)
    await waitFor(async () => (await tasks()).some((x) => x.id === saved.id), '重启后恢复任务')
    const multi = (await tasks()).find((x) => x.description === '持续推进编辑后')
    assert.ok(multi, '隐藏的多天任务保留')
    await js(main, `window.myTodo.openWindow('main', 'settings')`)
    await click(main, '[data-testid=show-multi-day]')
    await waitFor(async () => (await visibleGroups()).includes('multi-day'), '重新开启持续推进')
    await capture(note, 'note-archive-restart.png')
    return
  }

  assert.deepEqual(await visibleGroups(), [])
  assert.equal(
    await js(
      note,
      `document.querySelector('[data-note-group=archived]').getAttribute('aria-expanded')`
    ),
    'false'
  )
  assert.equal(
    await js(
      note,
      `document.querySelector('[data-note-group=archived] .note-group-count').textContent`
    ),
    '0'
  )
  const emptyPaint = () =>
    js(
      note,
      `(() => {
    const empty = document.querySelector('.note-empty');
    const icon = getComputedStyle(empty.querySelector('.note-empty-icon'));
    return { icon: icon.color, background: icon.backgroundColor };
  })()`
    )
  const originalEmptyPaint = await emptyPaint()
  await js(
    note,
    `(async () => { const current = (await window.myTodo.getWindowState()).data; await window.myTodo.updateSettings({ ...current.settings, themeColor: '#467a63' }) })()`
  )
  await waitFor(
    async () => (await emptyPaint()).icon !== originalEmptyPaint.icon,
    '无任务图标同步主题色'
  )
  const themedEmptyPaint = await emptyPaint()
  assert.notEqual(themedEmptyPaint.icon, originalEmptyPaint.icon, '空页面字母同步主题色')
  assert.equal(themedEmptyPaint.background, 'rgba(0, 0, 0, 0)', '空页面图标无背景色')
  await capture(note, 'note-empty-themed.png')
  await js(
    note,
    `(async () => { const current = (await window.myTodo.getWindowState()).data; await window.myTodo.updateSettings({ ...current.settings, themeColor: '#526fc4' }) })()`
  )
  await waitFor(async () => (await emptyPaint()).icon === originalEmptyPaint.icon, '恢复默认主题色')
  const task = (await js(note, `window.myTodo.createTask('便签归档验证')`)).data
  await waitFor(
    () => js(note, `Boolean(document.querySelector('[data-task-id="${task.id}"]'))`),
    '新增任务同步'
  )
  dialog.showMessageBox = async () => {
    throw new Error('删除不应使用系统确认')
  }
  await click(note, `[data-task-id="${task.id}"] [data-testid=task-delete]`)
  await waitFor(async () => (await archived()).some((x) => x.id === task.id), '归档任务')
  assert.equal(
    await js(note, 'Boolean(document.querySelector("[role=alertdialog]"))'),
    false,
    '归档不弹确认'
  )
  await waitFor(
    () => js(main, `!document.querySelector('[data-task-id="${task.id}"]')`),
    '归档同步到主界面'
  )
  await waitFor(
    () =>
      js(
        note,
        `document.querySelector('.note-task-summary').getAttribute('aria-label') === '在主界面打开任务，已完成0项，共0项'`
      ),
    '归档从进度统计排除'
  )
  await click(note, '[data-note-group=archived]')
  const row = `[data-archived-task-id="${task.id}"]`
  note.webContents.sendInputEvent({ type: 'mouseMove', x: 5, y: 5 })
  await js(note, `document.activeElement?.blur()`)
  assert.equal(
    await js(note, `getComputedStyle(document.querySelector('${row} .task-pin')).visibility`),
    'visible',
    '默认恢复可见'
  )
  await waitFor(
    () =>
      js(
        note,
        `getComputedStyle(document.querySelector('${row} .note-archive-delete')).visibility === 'hidden'`
      ),
    '默认隐藏永久删除'
  )
  assert.equal(
    await js(
      note,
      `document.querySelector('${row}').querySelectorAll('input,textarea,[draggable=true]').length`
    ),
    0,
    '归档只读'
  )
  await js(note, `document.querySelector('[aria-label="恢复：便签归档验证"]').focus()`)
  assert.equal(
    await js(
      note,
      `getComputedStyle(document.querySelector('${row} .note-archive-delete')).visibility`
    ),
    'visible',
    '聚焦时可删除'
  )
  await keyboardActivate('[aria-label="恢复：便签归档验证"]')
  await waitFor(
    async () => (await archived()).length === 0 && (await tasks()).some((x) => x.id === task.id),
    '恢复任务'
  )
  await waitFor(
    () => js(main, `Boolean(document.querySelector('[data-task-id="${task.id}"]'))`),
    '恢复同步主界面'
  )
  await click(note, `[data-task-id="${task.id}"] [data-testid=task-delete]`)
  await waitFor(async () => (await archived()).length === 1, '再次归档')
  const point = await js(
    note,
    `(() => { const row = document.querySelector('${row}'); row.scrollIntoView(); const r = row.getBoundingClientRect(); return {x: Math.round(r.x + 30), y: Math.round(r.y + r.height / 2)} })()`
  )
  note.webContents.sendInputEvent({ type: 'mouseMove', ...point })
  await waitFor(
    () =>
      js(
        note,
        `getComputedStyle(document.querySelector('${row} .note-archive-delete')).visibility === 'visible'`
      ),
    'hover显示永久删除'
  )
  await keyboardActivate('[aria-label="永久删除：便签归档验证"]')
  await waitFor(
    () => js(note, 'document.querySelectorAll("[role=alertdialog]").length === 1'),
    '永久删除确认'
  )
  await keyboardActivate('[data-testid=delete-cancel]')
  await waitFor(() => js(note, '!document.querySelector("[role=alertdialog]")'), '取消关闭确认')
  await js(
    note,
    'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
  )
  assert.equal((await archived()).length, 1, '取消删除保留归档')
  await keyboardActivate('[aria-label="永久删除：便签归档验证"]')
  await waitFor(
    () => js(note, 'document.querySelectorAll("[role=alertdialog]").length === 1'),
    '每次永久删除只确认一次'
  )
  await keyboardActivate('[data-testid=delete-confirm]')
  await waitFor(async () => (await archived()).length === 0, '永久删除归档')

  const habit = (await js(note, `window.myTodo.createHabit('习惯双击验证')`)).data
  const habitTask = (await tasks()).find((x) => x.habitId === habit.id)
  const description = `[data-task-id="${habitTask.id}"] [data-testid=task-description]`
  await js(main, `window.myTodo.openWindow('main', 'task')`)
  const revision = (await state(main)).mainNavigation.revision
  await click(note, description)
  assert.equal((await state(main)).mainNavigation.revision, revision, '单击习惯不打开主界面')
  await js(
    note,
    `document.querySelector('${description}').dispatchEvent(new MouseEvent('dblclick', {bubbles:true}))`
  )
  await waitFor(async () => (await state(main)).mainNavigation?.page === 'habit', '双击打开习惯页')
  assert.equal((await state(main)).mainNavigation.revision, revision + 1, '双击只打开一次')
  await js(note, `document.querySelector('${description}').focus()`)
  note.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
  note.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
  await waitFor(
    async () => (await state(main)).mainNavigation?.revision === revision + 2,
    '键盘打开习惯页'
  )
  await click(note, `[data-task-id="${habitTask.id}"] input[type=checkbox]`)
  await waitFor(
    async () => (await tasks()).find((x) => x.id === habitTask.id)?.completed,
    '习惯完成'
  )
  await click(note, `[data-task-id="${habitTask.id}"] [data-testid=task-delete]`)
  await waitFor(async () => !(await tasks()).some((x) => x.id === habitTask.id), '习惯暂停一次')
  assert.equal((await archived()).length, 0, '习惯暂停不进入归档')

  const multi = (await js(note, `window.myTodo.createTask('持续推进验证')`)).data
  await js(note, `window.myTodo.convertToMultiDay('${multi.id}')`)
  await click(note, '[data-note-group=multi-day]')
  await click(note, `[data-task-id="${multi.id}"] [data-testid=task-delete]`)
  await waitFor(async () => (await archived()).some((x) => x.id === multi.id), '便签归档多天任务')
  await click(note, '[aria-label="恢复：持续推进验证"]')
  await waitFor(
    async () => (await tasks()).some((x) => x.id === multi.id && x.kind === 'multi-day'),
    '便签恢复多天任务'
  )
  const saved = (await js(note, `window.myTodo.createTask('保留归档任务')`)).data
  await js(note, `window.myTodo.archiveTask('${saved.id}')`)
  await js(main, `window.myTodo.openWindow('main', 'settings')`)
  await waitFor(() => js(main, `!document.querySelector('.settings-page').hidden`), '打开设置')
  assert.deepEqual(
    await js(
      main,
      `Array.from(document.querySelectorAll('.settings-group')).map(x => x.getAttribute('aria-label'))`
    ),
    ['个性化', '系统偏好', '便签偏好']
  )
  assert.equal(
    await js(
      main,
      `document.querySelector('[data-testid=show-multi-day]').closest('.settings-group').getAttribute('aria-label')`
    ),
    '便签偏好'
  )
  await click(note, `[data-task-id="${multi.id}"] [data-testid=task-description]`)
  await js(
    note,
    `document.querySelector('[data-testid=task-edit]').dispatchEvent(new CompositionEvent('compositionstart', {bubbles:true}))`
  )
  await input(note, '[data-testid=task-edit]', '持续推进编辑后', null)
  await click(main, '[data-testid=show-multi-day]')
  await waitFor(
    () =>
      js(
        main,
        `document.querySelector('.settings-page [role=alert]')?.textContent.includes('请先保存')`
      ),
    '保存受阻时保持分栏'
  )
  assert.equal((await state(note)).settings.showMultiDay, true)
  assert.equal(
    await js(note, `document.querySelector('[data-testid=task-edit]').value`),
    '持续推进编辑后',
    '失败保留草稿'
  )
  await js(
    note,
    `document.querySelector('[data-testid=task-edit]').dispatchEvent(new CompositionEvent('compositionend', {bubbles:true}))`
  )
  await waitFor(
    async () => (await tasks()).find((x) => x.id === multi.id)?.description === '持续推进编辑后',
    '继续保存草稿'
  )
  await click(main, '[data-testid=show-multi-day]')
  await waitFor(async () => !(await state(note)).settings.showMultiDay, '关闭持续推进')
  assert.deepEqual(await visibleGroups(), ['archived'])
  assert.equal((await tasks()).length, 1, '隐藏分栏保留任务数据')
  assert.equal(
    await js(note, `document.querySelector('.note-task-summary').getAttribute('aria-label')`),
    '在主界面打开任务，已完成0项，共0项'
  )
  await js(note, `window.myTodo.setTaskCompleted('${multi.id}', true)`)
  await waitFor(
    async () => (await tasks()).find((x) => x.id === multi.id)?.completed,
    '隐藏任务完成'
  )
  assert.equal(
    await js(note, `document.querySelector('.note-task-summary').getAttribute('aria-label')`),
    '在主界面打开任务，已完成0项，共0项',
    '隐藏的持续推进不计入完成数和总数'
  )
  await js(note, `window.myTodo.setTaskCompleted('${multi.id}', false)`)
  await js(main, `window.myTodo.openWindow('main', 'task')`)
  await waitFor(
    () => js(main, `!document.querySelector('[data-task-id="${multi.id}"]')`),
    '主界面同步隐藏多天任务'
  )
  await capture(note, 'note-archive.png')
  await js(main, `window.myTodo.openWindow('main', 'settings')`)
  await waitFor(() => js(main, `!document.querySelector('.settings-page').hidden`), '设置截图就绪')
  assert.equal(
    await js(
      main,
      `document.querySelector('.workbench-header').textContent.includes('系统与桌面便签偏好')`
    ),
    false
  )
  const defaultPaint = await themePaint()
  await click(main, '[aria-label="鸢紫主题"]')
  await waitFor(
    async () => (await state(note)).settings.themeColor === '#7955b3',
    '预设主题跨窗口同步'
  )
  const purplePaint = await themePaint()
  for (const key of ['border', 'hover', 'focus', 'noteButtonHover'])
    assert.notEqual(purplePaint[key], defaultPaint[key], `${key}跟随预设主题色`)
  await input(main, '[aria-label="主题色十六进制值"]', '#467a63', null)
  await click(main, '[data-testid=theme-apply]')
  await waitFor(
    async () => (await state(note)).settings.themeColor === '#467a63',
    '保存自定义主题色'
  )
  for (const window of [main, note]) {
    await waitFor(
      () =>
        js(window, `document.documentElement.style.getPropertyValue('--app-accent') === '#467a63'`),
      '窗口应用自定义主题'
    )
  }
  const customPaint = await themePaint()
  for (const key of ['border', 'hover', 'focus', 'noteButtonHover'])
    assert.notEqual(customPaint[key], purplePaint[key], `${key}跟随自定义主题色`)
  assert.equal(
    await js(
      main,
      `(async () => { const current = (await window.myTodo.getWindowState()).data; return (await window.myTodo.updateSettings({ ...current.settings, themeColor: 'invalid' })).ok })()`
    ),
    false,
    '拒绝无效主题颜色'
  )
  await capture(main, 'note-settings.png')
}

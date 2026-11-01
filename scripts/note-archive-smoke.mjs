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
    assert.deepEqual(await visibleGroups(), ['today', 'archived'])
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

  assert.deepEqual(await visibleGroups(), ['today', 'multi-day', 'archived'])
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
  const task = (await js(note, `window.myTodo.createTask('便签归档验证')`)).data
  await waitFor(
    () => js(note, `Boolean(document.querySelector('[data-task-id="${task.id}"]'))`),
    '新增任务同步'
  )
  let confirmations = 0
  dialog.showMessageBox = async () => {
    confirmations++
    return { response: 0, checkboxChecked: false }
  }
  await click(note, `[data-task-id="${task.id}"] [data-testid=task-delete]`)
  await waitFor(async () => (await archived()).some((x) => x.id === task.id), '归档任务')
  assert.equal(confirmations, 0, '归档不弹确认')
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
  await waitFor(() => confirmations === 1, '永久删除确认')
  assert.equal((await archived()).length, 1, '取消删除保留归档')
  dialog.showMessageBox = async () => {
    confirmations++
    return { response: 1, checkboxChecked: false }
  }
  await keyboardActivate('[aria-label="永久删除：便签归档验证"]')
  await waitFor(async () => (await archived()).length === 0, '永久删除归档')
  assert.equal(confirmations, 2, '每次永久删除只确认一次')

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
    ['系统偏好', '便签偏好']
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
  assert.deepEqual(await visibleGroups(), ['today', 'archived'])
  assert.equal((await tasks()).length, 1, '隐藏分栏保留任务数据')
  assert.equal(
    await js(note, `document.querySelector('.note-task-summary').getAttribute('aria-label')`),
    '在主界面打开任务，已完成0项，共0项'
  )
  await js(note, `window.myTodo.setTaskCompleted('${multi.id}', true)`)
  await waitFor(async () => (await tasks()).find((x) => x.id === multi.id)?.completed, '隐藏任务完成')
  assert.equal(
    await js(note, `document.querySelector('.note-task-summary').getAttribute('aria-label')`),
    '在主界面打开任务，已完成0项，共0项',
    '隐藏的持续推进不计入完成数和总数'
  )
  await js(note, `window.myTodo.setTaskCompleted('${multi.id}', false)`)
  await js(main, `window.myTodo.openWindow('main', 'task')`)
  await waitFor(
    () => js(main, `Boolean(document.querySelector('[data-task-id="${multi.id}"]'))`),
    '主界面多天任务不受影响'
  )
  await capture(note, 'note-archive.png')
  await js(main, `window.myTodo.openWindow('main', 'settings')`)
  await waitFor(() => js(main, `!document.querySelector('.settings-page').hidden`), '设置截图就绪')
  await capture(main, 'note-settings.png')
}

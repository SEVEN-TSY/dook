import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'
import { screen } from 'electron'

export async function deleteConfirmationSmoke({
  main,
  note,
  js,
  click,
  input,
  waitFor,
  assert,
  dialog,
  capture
}) {
  dialog.showMessageBox = async () => {
    throw new Error('删除不应使用系统确认')
  }
  await waitFor(
    () => js(main, 'Boolean(document.querySelector(".workbench-header h1"))'),
    '主界面就绪'
  )
  const task = (await js(note, `window.dook.createTask('应用内删除验证')`)).data
  await waitFor(
    () => js(main, `Boolean(document.querySelector('[data-task-id="${task.id}"]'))`),
    '任务同步'
  )
  const focus = (window, selector) =>
    js(window, `document.querySelector(${JSON.stringify(selector)}).focus()`)
  const expectFocus = async (window, selector, message) => {
    await js(
      window,
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
    )
    assert.equal(
      await js(
        window,
        `document.activeElement === document.querySelector(${JSON.stringify(selector)})`
      ),
      true,
      `${message}；当前焦点：${await js(window, 'document.activeElement?.outerHTML.slice(0, 180)')}`
    )
  }
  await js(
    main,
    `document.querySelector('[data-task-id="${task.id}"] .task-more').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true,button:0,ctrlKey:false,pointerType:'mouse'}))`
  )
  await click(main, '[data-testid=task-delete]')
  await waitFor(
    async () =>
      !(await js(note, 'window.dook.listToday()')).data.tasks.some((x) => x.id === task.id),
    '菜单归档同步'
  )
  assert.equal(
    await js(main, 'Boolean(document.querySelector("[role=alertdialog]"))'),
    false,
    '普通任务归档无需确认'
  )
  await js(note, `window.dook.deleteArchivedTask('${task.id}')`)
  const archived = (await js(note, `window.dook.createTask('归档确认验证')`)).data
  await js(note, `window.dook.archiveTask('${archived.id}')`)
  await waitFor(
    () =>
      js(
        note,
        'document.querySelector("[data-testid=task-archive-toggle]").textContent.includes("1")'
      ),
    '归档无需确认'
  )
  assert.equal(await js(note, 'Boolean(document.querySelector("[role=alertdialog]"))'), false)
  await click(note, '[data-testid=task-archive-toggle]')
  await focus(note, `[aria-label="恢复：${archived.description}"]`)
  await focus(note, `[aria-label="永久删除：${archived.description}"]`)
  await expectFocus(
    note,
    `[aria-label="永久删除：${archived.description}"]`,
    '键盘聚焦便签永久删除入口'
  )
  await click(note, `[aria-label="永久删除：${archived.description}"]`)
  await waitFor(
    () => js(note, 'Boolean(document.querySelector("[role=alertdialog]"))'),
    '便签归档删除应用内确认'
  )
  assert.match(
    await js(note, 'document.querySelector("[role=alertdialog]").textContent'),
    /子事项.*无法恢复/
  )
  await capture(note, 'delete-confirmation-note.png')
  const originalBounds = note.getBounds()
  const area = screen.getDisplayMatching(originalBounds).workArea
  const cursor = screen.getCursorScreenPoint
  let pointer = { x: area.x + 20, y: area.y + 100 }
  screen.getCursorScreenPoint = () => pointer
  try {
    note.setPosition(area.x, area.y + 60)
    note.emit('moved')
    await waitFor(
      async () => (await js(note, 'window.dook.getWindowState()')).data.edge === 'left',
      '便签贴边'
    )
    await new Promise((resolve) => setTimeout(resolve, 120))
    pointer = { x: area.x + area.width / 2, y: area.y + area.height / 2 }
    await new Promise((resolve) => setTimeout(resolve, 5000))
    assert.equal(
      (await js(note, 'window.dook.getWindowState()')).data.collapsed,
      false,
      '应用内确认期间便签不自动收起'
    )
    assert.ok(await js(note, 'Boolean(document.querySelector("[role=alertdialog]"))'))
  } finally {
    note.setBounds(originalBounds)
    note.emit('moved')
    screen.getCursorScreenPoint = cursor
  }
  note.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  await waitFor(() => js(note, '!document.querySelector("[role=alertdialog]")'), 'Esc取消')
  await expectFocus(
    note,
    `[aria-label="永久删除：${archived.description}"]`,
    '便签Esc取消后恢复永久删除按钮焦点'
  )
  assert.ok(
    (await js(main, 'window.dook.listArchivedTasks()')).data.some((x) => x.id === archived.id)
  )
  await click(note, `[aria-label="永久删除：${archived.description}"]`)
  await click(note, '[data-testid=delete-confirm]')
  await waitFor(
    async () =>
      !(await js(main, 'window.dook.listArchivedTasks()')).data.some((x) => x.id === archived.id),
    '归档永久删除同步'
  )
  await waitFor(
    () => js(note, `!document.querySelector('[data-archived-task-id="${archived.id}"]')`),
    '归档删除行已移除'
  )
  await expectFocus(note, '.task-list', '删除归档行后焦点保留在稳定的任务列表')
  const habit = (await js(note, `window.dook.createHabit('习惯删除验证')`)).data
  await click(main, '.workbench-nav [aria-label="习惯"]')
  await click(main, `[data-habit-id="${habit.id}"] [data-testid=habit-archive]`)
  await click(main, '[aria-label="已暂停习惯"]')
  const habitDelete = `[data-habit-id="${habit.id}"] [data-testid=habit-delete]`
  await focus(main, `[data-habit-id="${habit.id}"] [data-testid=habit-restore]`)
  await focus(main, habitDelete)
  await click(main, habitDelete)
  await waitFor(
    () => js(main, 'Boolean(document.querySelector("[role=alertdialog]"))'),
    '习惯删除应用内确认'
  )
  assert.match(
    await js(main, 'document.querySelector("[role=alertdialog]").textContent'),
    /习惯将被永久删除，无法恢复，历史任务保留/
  )
  const mainProtectionBounds = note.getBounds()
  const mainProtectionArea = screen.getDisplayMatching(mainProtectionBounds).workArea
  const mainProtectionCursor = screen.getCursorScreenPoint
  let mainProtectionPointer = { x: mainProtectionArea.x + 20, y: mainProtectionArea.y + 100 }
  screen.getCursorScreenPoint = () => mainProtectionPointer
  try {
    note.setPosition(mainProtectionArea.x, mainProtectionArea.y + 60)
    note.emit('moved')
    await waitFor(
      async () => (await js(note, 'window.dook.getWindowState()')).data.edge === 'left',
      '主界面确认时便签贴边'
    )
    await new Promise((resolve) => setTimeout(resolve, 150))
    mainProtectionPointer = {
      x: mainProtectionArea.x + mainProtectionArea.width / 2,
      y: mainProtectionArea.y + mainProtectionArea.height / 2
    }
    await new Promise((resolve) => setTimeout(resolve, 5000))
    assert.equal(
      (await js(note, 'window.dook.getWindowState()')).data.collapsed,
      false,
      '主界面确认期间便签不自动收起'
    )
    await click(note, '.note-add-button')
    await expectFocus(note, '[data-testid=task-new]', '便签输入获得独立交互保护')
    // 保持便签输入焦点，单独关闭主界面确认，验证两窗口保护互不覆盖。
    await js(main, `document.querySelector('[data-testid=delete-cancel]').click()`)
    await expectFocus(main, habitDelete, '主界面取消后恢复习惯删除按钮焦点')
    await new Promise((resolve) => setTimeout(resolve, 5000))
    assert.equal(
      (await js(note, 'window.dook.getWindowState()')).data.collapsed,
      false,
      '主界面确认关闭后保留便签输入保护'
    )
    await focus(note, '.task-list')
    await waitFor(
      async () => (await js(note, 'window.dook.getWindowState()')).data.collapsed,
      '主界面确认和便签输入均结束后恢复自动收起'
    )
    mainProtectionPointer = { x: mainProtectionArea.x + 20, y: mainProtectionArea.y + 100 }
    await js(main, `window.dook.openWindow('note')`)
    await waitFor(
      async () => !(await js(note, 'window.dook.getWindowState()')).data.collapsed,
      '继续展开便签'
    )
    await click(main, habitDelete)
    await waitFor(
      () => js(main, 'Boolean(document.querySelector("[role=alertdialog]"))'),
      '关闭窗口前确认已打开'
    )
    mainProtectionPointer = {
      x: mainProtectionArea.x + mainProtectionArea.width / 2,
      y: mainProtectionArea.y + mainProtectionArea.height / 2
    }
    main.close()
    await waitFor(() => !main.isVisible(), '确认所属主窗口隐藏')
    await waitFor(
      () => js(main, '!document.querySelector("[role=alertdialog]")'),
      '隐藏主窗口取消确认'
    )
    await waitFor(
      async () => (await js(note, 'window.dook.getWindowState()')).data.collapsed,
      '隐藏确认所属窗口后释放便签保护'
    )
    await js(note, `window.dook.openWindow('main')`)
    await waitFor(() => main.isVisible(), '重新打开主窗口')
    assert.equal(
      await js(main, 'Boolean(document.querySelector("[role=alertdialog]"))'),
      false,
      '重开主窗口不遗留旧确认'
    )
    assert.ok(
      (await js(note, 'window.dook.listArchivedHabits()')).data.some((x) => x.id === habit.id),
      '隐藏窗口取消不删除习惯'
    )
    mainProtectionPointer = { x: mainProtectionArea.x + 20, y: mainProtectionArea.y + 100 }
    await js(main, `window.dook.openWindow('note')`)
    await waitFor(
      async () => !(await js(note, 'window.dook.getWindowState()')).data.collapsed,
      '隐藏取消后继续展开便签'
    )
  } finally {
    note.setBounds(mainProtectionBounds)
    note.emit('moved')
    screen.getCursorScreenPoint = mainProtectionCursor
  }
  assert.ok(
    (await js(note, 'window.dook.listArchivedHabits()')).data.some((x) => x.id === habit.id)
  )
  await click(main, habitDelete)
  main.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  await waitFor(() => js(main, '!document.querySelector("[role=alertdialog]")'), '主界面Esc取消')
  await expectFocus(main, habitDelete, '主界面Esc取消后恢复习惯删除按钮焦点')
  await click(main, `[data-habit-id="${habit.id}"] [data-testid=habit-delete]`)
  await click(main, '[data-testid=delete-confirm]')
  await waitFor(
    async () =>
      !(await js(note, 'window.dook.listArchivedHabits()')).data.some((x) => x.id === habit.id),
    '习惯确认删除'
  )
  await waitFor(
    () => js(main, `!document.querySelector('[data-habit-id="${habit.id}"]')`),
    '习惯删除行已移除'
  )
  await expectFocus(main, '.workbench-main', '删除习惯行后焦点保留在稳定的当前页面')
  assert.ok(
    !(await js(note, 'window.dook.listToday()')).data.tasks.some((x) => x.habitId === habit.id),
    '删除习惯清理当天任务'
  )
  const topic = (await js(note, `window.dook.createInspirationTopic('删除关联主题')`)).data
  const idea = (await js(note, `window.dook.createInspiration('保留关联小记', '${topic.id}')`))
    .data
  const archivedIdea = (
    await js(note, `window.dook.createInspiration('保留归档关联', '${topic.id}')`)
  ).data
  await js(note, `window.dook.appendInspiration('${idea.id}', '保留历史补充')`)
  await js(note, `window.dook.archiveInspiration('${archivedIdea.id}')`)
  await click(main, '.workbench-nav [aria-label="小记"]')
  await js(
    main,
    `Array.from(document.querySelectorAll('.inspiration-views button')).find(x => x.textContent === '主题').click()`
  )
  await click(main, '[aria-label="删除删除关联主题"]')
  await waitFor(
    () => js(main, 'Boolean(document.querySelector("[role=alertdialog]"))'),
    '主题删除应用内确认'
  )
  assert.match(
    await js(main, 'document.querySelector("[role=alertdialog]").textContent'),
    /2条小记及其内容会保留/
  )
  await click(main, '[data-testid=delete-cancel]')
  assert.ok(
    (await js(note, 'window.dook.listInspirationTopics()')).data.some((x) => x.id === topic.id)
  )
  await click(main, '[aria-label="删除删除关联主题"]')
  await click(main, '[data-testid=delete-confirm]')
  await waitFor(
    async () =>
      !(await js(note, 'window.dook.listInspirationTopics()')).data.some(
        (x) => x.id === topic.id
      ),
    '主题删除同步'
  )
  const retained = (await js(note, 'window.dook.listInspirations()')).data.find(
    (x) => x.id === idea.id
  )
  assert.equal(retained.description, '保留关联小记')
  assert.equal(retained.additions[0].content, '保留历史补充')
  assert.deepEqual(retained.topicIds, [])
  assert.ok(
    (
      await js(note, `window.dook.listInspirationPage(0, 50, { kind: 'archive' })`)
    ).data.items.some((x) => x.id === archivedIdea.id),
    '删除主题保留归档小记'
  )
  await js(
    main,
    `Array.from(document.querySelectorAll('.inspiration-views button')).find(x => x.textContent === '日期').click()`
  )
  await click(main, '[title="已归档"]')
  await click(main, '[aria-label="永久删除小记"]')
  await waitFor(
    () => js(main, 'Boolean(document.querySelector("[role=alertdialog]"))'),
    '归档小记应用内确认'
  )
  assert.match(
    await js(main, 'document.querySelector("[role=alertdialog]").textContent'),
    /补充.*无法恢复/
  )
  await click(main, '[data-testid=delete-cancel]')
  assert.ok(
    (
      await js(note, `window.dook.listInspirationPage(0, 50, { kind: 'archive' })`)
    ).data.items.some((x) => x.id === archivedIdea.id)
  )
  await click(main, '[aria-label="永久删除小记"]')
  await click(main, '[data-testid=delete-confirm]')
  await waitFor(
    async () =>
      !(
        await js(note, `window.dook.listInspirationPage(0, 50, { kind: 'archive' })`)
      ).data.items.some((x) => x.id === archivedIdea.id),
    '归档小记永久删除'
  )
  await click(main, '.workbench-nav [aria-label="任务"]')
  const editable = (await js(note, `window.dook.createTask('返回保存验证')`)).data
  await waitFor(
    () => js(main, `Boolean(document.querySelector('[data-task-id="${editable.id}"] .task-more'))`),
    '返回保存任务同步主界面'
  )
  await js(
    main,
    `document.querySelector('[data-task-id="${editable.id}"] .task-more').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: false, pointerType: 'mouse' }))`
  )
  await click(main, '[data-testid=task-convert]')
  await click(main, '[aria-label="新增子事项"]')
  await input(main, '.subitems-panel [data-testid=subitem-new]', '返回前草稿', null)
  const db = new DatabaseSync(resolve(process.env.DOOK_SMOKE_DATA, 'dook.sqlite'))
  try {
    db.exec(
      "CREATE TRIGGER reject_return_save BEFORE UPDATE ON tasks BEGIN SELECT RAISE(ABORT, '返回保存失败'); END"
    )
    await click(main, '[aria-label^="折叠子事项"]')
    await waitFor(
      () =>
        js(
          main,
          'Boolean(document.querySelector("[role=alert], [data-sonner-toast][data-type=error] [data-title]"))'
        ),
      '返回保存失败反馈'
    )
    assert.equal(
      await js(main, 'document.querySelector(".subitems-panel [data-testid=subitem-new]").value'),
      '返回前草稿',
      '失败保留详情和草稿'
    )
  } finally {
    db.exec('DROP TRIGGER reject_return_save')
    db.close()
  }
  await capture(main, 'return-list-main.png')
  await click(main, '[aria-label^="折叠子事项"]')
  await waitFor(() => js(main, '!document.querySelector(".subitems-panel")'), '成功返回列表')
  assert.equal(
    (await js(note, 'window.dook.listToday()')).data.tasks.find((x) => x.id === editable.id)
      .subitems[0].description,
    '返回前草稿'
  )
  const skippedHabit = (await js(note, `window.dook.createHabit('直接暂停验证')`)).data
  const skippedTask = (await js(note, 'window.dook.listToday()')).data.tasks.find(
    (x) => x.habitId === skippedHabit.id
  )
  await click(note, `[data-task-id="${skippedTask.id}"] [data-testid=task-delete]`)
  await waitFor(
    async () =>
      !(await js(note, 'window.dook.listToday()')).data.tasks.some(
        (x) => x.id === skippedTask.id
      ),
    '暂停一次直接执行'
  )
  assert.equal(await js(note, 'Boolean(document.querySelector("[role=alertdialog]"))'), false)
  await js(note, `window.dook.archiveTask('${editable.id}')`)
  await click(main, '.archive-view-switch [aria-label="已归档任务"]')
  const deleteButton = `[aria-label="永久删除：${editable.description}"]`
  await click(main, deleteButton)
  const originalSize = main.getSize()
  main.setSize(760, 650)
  await capture(main, 'delete-confirmation-main-narrow.png')
  main.setSize(...originalSize)
  const failureDb = new DatabaseSync(resolve(process.env.DOOK_SMOKE_DATA, 'dook.sqlite'))
  try {
    failureDb.exec(
      "CREATE TRIGGER reject_confirmed_delete BEFORE DELETE ON tasks BEGIN SELECT RAISE(ABORT, '删除失败验证'); END"
    )
    await click(main, '[data-testid=delete-confirm]')
    await waitFor(
      () =>
        js(
          main,
          'Boolean(document.querySelector("[role=alert], [data-sonner-toast][data-type=error] [data-title]"))'
        ),
      '删除失败反馈'
    )
    assert.ok(
      (await js(note, 'window.dook.listArchivedTasks()')).data.some((x) => x.id === editable.id),
      '删除失败保留原界面数据'
    )
    assert.equal(await js(main, 'Boolean(document.querySelector("[role=alertdialog]"))'), false)
  } finally {
    failureDb.exec('DROP TRIGGER reject_confirmed_delete')
    failureDb.close()
  }
  await click(main, deleteButton)
  await click(main, '[data-testid=delete-confirm]')
  await waitFor(
    async () =>
      !(await js(note, 'window.dook.listArchivedTasks()')).data.some((x) => x.id === editable.id),
    '删除失败后重试'
  )
}

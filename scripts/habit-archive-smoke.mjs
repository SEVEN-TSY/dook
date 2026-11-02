export async function habitArchiveSmoke({ main, note, js, click, input, waitFor, assert }) {
  const habit = (await js(main, `window.myTodo.createHabit('归档习惯验证')`)).data
  const archived = async () => (await js(main, 'window.myTodo.listArchivedHabits()')).data
  const tasks = async () => (await js(note, 'window.myTodo.listToday()')).data.tasks
  await click(main, '.workbench-nav [aria-label="习惯"]')
  const row = `[data-habit-id="${habit.id}"]`
  await click(main, `${row} [data-testid=habit-archive]`)
  await waitFor(async () => (await archived()).some((x) => x.id === habit.id), '归档习惯')
  assert.equal(await js(main, 'Boolean(document.querySelector("[role=alertdialog]"))'), false)
  assert.equal(
    (await tasks()).some((x) => x.habitId === habit.id),
    false
  )
  await click(main, '[aria-label="已归档习惯"]')
  await waitFor(() => js(main, `Boolean(document.querySelector('${row}'))`), '已归档列表')
  assert.equal(
    await js(main, `Boolean(document.querySelector('${row} [data-testid=habit-edit]'))`),
    false
  )
  await click(main, `${row} [data-testid=habit-restore]`)
  await waitFor(async () => (await tasks()).some((x) => x.habitId === habit.id), '恢复同步便签')
  await click(main, '[aria-label="全部习惯"]')
  await click(main, `${row} [data-testid=habit-archive]`)
  await waitFor(async () => (await archived()).length === 1, '再次归档')
  await click(main, '[aria-label="已归档习惯"]')
  await click(main, `${row} [data-testid=habit-delete]`)
  await click(main, '[data-testid=delete-cancel]')
  assert.equal((await archived()).length, 1)
  await click(main, `${row} [data-testid=habit-delete]`)
  await click(main, '[data-testid=delete-confirm]')
  await waitFor(async () => (await archived()).length === 0, '确认永久删除')
  const task = (await js(main, `window.myTodo.createTask('子事项详情验证')`)).data
  await click(main, '.workbench-nav [aria-label="任务"]')
  await js(
    main,
    `document.querySelector('[data-task-id="${task.id}"] .task-more').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: false, pointerType: 'mouse' }))`
  )
  await click(main, '[data-testid=task-details]')
  await waitFor(
    () =>
      js(main, `Boolean(document.querySelector('.workbench-detail [data-testid=subitem-new]'))`),
    '详情默认展开子事项'
  )
  assert.equal(
    await js(
      main,
      `Boolean(document.querySelector('.workbench-detail .detail-description, .workbench-detail [data-testid=task-progress], .workbench-detail [data-testid=task-edit]'))`
    ),
    false
  )
  await input(main, '.workbench-detail [data-testid=subitem-new]', '详情添加子事项')
  await waitFor(
    async () => (await tasks()).find((x) => x.id === task.id)?.subitems?.length === 1,
    '子事项新增可用'
  )
}

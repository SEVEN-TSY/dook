export async function habitArchiveSmoke({
  main,
  note,
  js,
  click,
  input,
  waitFor,
  assert,
  capture
}) {
  const habit = (await js(main, `window.myTodo.createHabit('归档习惯验证')`)).data
  const archived = async () => (await js(main, 'window.myTodo.listArchivedHabits()')).data
  const tasks = async () => (await js(note, 'window.myTodo.listToday()')).data.tasks
  await click(main, '.workbench-nav [aria-label="习惯"]')
  const row = `[data-habit-id="${habit.id}"]`
  await waitFor(
    () =>
      js(
        main,
        `document.querySelector('[aria-label="当前习惯"] .archive-filter-count')?.textContent === '1'`
      ),
    '习惯数量显示在切换栏'
  )
  assert.equal(
    await js(main, `document.querySelector('[aria-label="当前习惯"] > span').textContent`),
    '当前'
  )
  assert.equal(
    await js(main, `Boolean(document.querySelector('${row} [data-testid=habit-edit]'))`),
    false,
    '移除独立编辑按钮'
  )
  await click(main, `${row} [data-testid=habit-schedule]`)
  await waitFor(
    () => js(main, `Boolean(document.querySelector('.habit-schedule-popover'))`),
    '打开同款周期浮窗'
  )
  assert.equal(
    await js(main, `document.querySelector('[aria-label="生成时间"]').dataset.time`),
    '07:00'
  )
  assert.equal(
    await js(
      main,
      `document.querySelectorAll('.habit-schedule-weekdays [aria-pressed=true]').length`
    ),
    5
  )
  const choose = async (label, value) => {
    await click(main, `[role=combobox][aria-label="${label}"]`)
    await waitFor(
      () => js(main, `Boolean(document.querySelector('[role=option][data-value="${value}"]'))`),
      `打开${label}`
    )
    await js(
      main,
      `document.querySelector('[role=option][data-value="${value}"]').scrollIntoView({ block: 'nearest' })`
    )
    await click(main, `[role=option][data-value="${value}"]`)
    await waitFor(() => js(main, `!document.querySelector('[role=listbox]')`), `选择${label}`)
  }
  const chooseCycle = (value) => choose('重复周期', value)
  const chooseTime = async (hour, minute) => {
    await choose('生成小时', hour)
    await choose('生成分钟', minute)
  }
  await chooseCycle('weekly')
  await waitFor(
    () => js(main, `document.querySelectorAll('.habit-schedule-weekdays button').length === 7`),
    '星期选择'
  )
  for (const day of '一二三四五') {
    await click(main, `[aria-label="星期${day}"]`)
  }
  await click(main, '.habit-schedule-footer button[type=submit]')
  await waitFor(
    () =>
      js(main, `document.querySelector('.habit-schedule-error')?.textContent.includes('至少选择')`),
    '未选星期失败保留浮窗'
  )
  await click(main, '[aria-label="星期一"]')
  await chooseTime('09', '30')
  await capture(main, 'habit-schedule-weekly.png')
  await click(main, '.habit-schedule-footer button[type=submit]')
  await waitFor(
    () => js(main, `!document.querySelector('.habit-schedule-popover')`),
    '周期保存关闭浮窗'
  )
  assert.equal(
    await js(
      main,
      `document.querySelector('[data-sonner-toast][data-type=success] [data-title]')?.textContent`
    ),
    '定时周期已保存'
  )
  let saved = (await js(main, 'window.myTodo.listHabits()')).data[0]
  assert.deepEqual(saved.schedule, { kind: 'weekly', time: '09:30', weekdays: [1] })
  await click(main, `${row} [data-testid=habit-schedule]`)
  await waitFor(
    () => js(main, `document.querySelector('[aria-label="生成时间"]')?.dataset.time === '09:30'`),
    '重新打开读取已保存时间'
  )
  await chooseCycle('interval')
  await input(main, '[aria-label="间隔天数"]', '3', null)
  await click(main, '.habit-schedule-footer button[type=submit]')
  await waitFor(
    () => js(main, `!document.querySelector('.habit-schedule-popover')`),
    '保存间隔周期'
  )
  saved = (await js(main, 'window.myTodo.listHabits()')).data[0]
  assert.equal(saved.schedule.intervalDays, 3)
  assert.match(saved.schedule.startsOn, /^\d{4}-\d{2}-\d{2}$/)
  await click(main, `${row} [data-testid=habit-schedule]`)
  await waitFor(
    () => js(main, `Boolean(document.querySelector('.habit-schedule-popover'))`),
    '再次打开'
  )
  await chooseCycle('daily')
  await click(main, '[aria-label="关闭定时周期"]')
  assert.equal(
    (await js(main, 'window.myTodo.listHabits()')).data[0].schedule.kind,
    'interval',
    '关闭不保存未提交更改'
  )
  await click(main, `${row} [data-testid=habit-schedule]`)
  await waitFor(
    () => js(main, `Boolean(document.querySelector('.habit-schedule-popover'))`),
    '恢复默认周期'
  )
  await chooseCycle('daily')
  await chooseTime('00', '00')
  await click(main, '.habit-schedule-footer button[type=submit]')
  await waitFor(() => js(main, `!document.querySelector('.habit-schedule-popover')`), '保存每天')
  await click(main, `${row} [data-testid=habit-archive]`)
  await waitFor(async () => (await archived()).some((x) => x.id === habit.id), '归档习惯')
  assert.equal(await js(main, 'Boolean(document.querySelector("[role=alertdialog]"))'), false)
  assert.equal(
    (await tasks()).some((x) => x.habitId === habit.id),
    false
  )
  await waitFor(
    () =>
      js(
        main,
        `document.querySelector('[aria-label="当前习惯"] .archive-filter-count')?.textContent === '0' && document.querySelector('[aria-label="已归档习惯"] .archive-filter-count')?.textContent === '1'`
      ),
    '归档同步两个数量'
  )
  await click(main, '[aria-label="已归档习惯"]')
  await waitFor(() => js(main, `Boolean(document.querySelector('${row}'))`), '已归档列表')
  assert.equal(
    await js(main, `Boolean(document.querySelector('${row} [data-testid=habit-edit]'))`),
    false
  )
  await click(main, `${row} [data-testid=habit-restore]`)
  await waitFor(async () => (await tasks()).some((x) => x.habitId === habit.id), '恢复同步便签')
  await click(main, '[aria-label="当前习惯"]')
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

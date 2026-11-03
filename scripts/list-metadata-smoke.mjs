import assert from 'node:assert/strict'

export async function listMetadataSmoke({ main, js, click, waitFor, capture }) {
  const toolbarGeometry = () =>
    js(
      main,
      `(() => {
        const bar = document.querySelector('.archive-view-switch, .inspiration-group-header');
        const rect = bar.getBoundingClientRect();
        const add = bar.querySelector('.composer-toggle').getBoundingClientRect();
        const selected = bar.querySelector('.archive-filter[aria-pressed="true"]');
        return { bottom: rect.bottom, addY: add.y, addRight: add.right,
          selectedBottom: selected?.getBoundingClientRect().bottom };
      })()`
    )
  const taskToolbar = await toolbarGeometry()
  assert.equal(taskToolbar.selectedBottom, taskToolbar.bottom - 1, '选中下划线与栏底分割线重合')
  await js(
    main,
    `Promise.all(Array.from({ length: 18 }, (_, i) => window.myTodo.createTask('列表任务' + i)))`
  )
  const task = (await js(main, `window.myTodo.createTask('菜单布局回归')`)).data
  await js(main, `window.myTodo.convertToMultiDay('${task.id}')`)
  await js(main, `window.myTodo.setTaskProgress('${task.id}', 40)`)
  await waitFor(
    () => js(main, `Boolean(document.querySelector('.task-mini-progress'))`),
    '持续推进就绪'
  )
  assert.ok(
    await js(
      main,
      `window.innerWidth - document.querySelector('.workbench-split').getBoundingClientRect().right <= 1`
    ),
    '任务滚动条位于窗口右缘'
  )
  await js(
    main,
    `document.querySelector('.workbench-split').scrollTop = document.querySelector('.workbench-split').scrollHeight`
  )
  assert.ok(
    await js(
      main,
      `window.innerHeight - document.querySelectorAll('.task-card-group')[1].getBoundingClientRect().bottom >= 15`
    ),
    '滚动到底后末张任务卡片保留底部留白'
  )
  const measure = () =>
    js(
      main,
      `(() => {
    const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return [r.x, r.y, r.width, r.height] }
    return { progress: rect('.task-mini-progress'), sidebar: rect('.workbench-sidebar'), list: rect('.workbench-list'), body: getComputedStyle(document.body).overflow }
  })()`
    )
  await js(
    main,
    `document.querySelector('[data-task-id="${task.id}"] .task-more').scrollIntoView({ block: 'center' })`
  )
  const fixedHeading = await js(
    main,
    `(() => {
    const title = document.querySelector('.workbench-header h1').getBoundingClientRect();
    const filter = document.querySelector('.archive-view-switch').getBoundingClientRect();
    return { titleY: title.y, filterY: filter.y, gap: filter.y - title.bottom, scroll: document.querySelector('.workbench-split').scrollTop, pageScroll: window.scrollY };
  })()`
  )
  assert.ok(fixedHeading.scroll > 0, '长任务列表在独立区域滚动')
  assert.equal(fixedHeading.pageScroll, 0, '任务列表滚动不移动页面')
  assert.ok(fixedHeading.gap >= 0 && fixedHeading.gap <= 16, '切换栏紧贴标题下方')
  await js(main, `document.querySelector('.workbench-split').scrollTop = 0`)
  assert.deepEqual(
    await js(
      main,
      `[document.querySelector('.workbench-header h1').getBoundingClientRect().y, document.querySelector('.archive-view-switch').getBoundingClientRect().y]`
    ),
    [fixedHeading.titleY, fixedHeading.filterY],
    '列表滚动时标题和切换栏位置固定'
  )
  await js(
    main,
    `document.querySelector('[data-task-id="${task.id}"] .task-more').scrollIntoView({ block: 'center' })`
  )
  const before = await measure()
  // Radix Trigger opens on pointerdown, matching an actual mouse click.
  await js(
    main,
    `document.querySelector('[data-task-id="${task.id}"] .task-more').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse', ctrlKey: false }))`
  )
  await waitFor(() => js(main, `Boolean(document.querySelector('[role=menu]'))`), '打开更多菜单')
  const after = await measure()
  assert.deepEqual(after.progress, before.progress, '打开菜单保持进度条尺寸和位置')
  assert.deepEqual(after.sidebar, before.sidebar, '打开菜单保持左栏宽度')
  assert.deepEqual(after.list, before.list, '打开菜单保持列表宽度')
  assert.ok(after.progress[1] >= 0 && after.progress[1] < 721, '菜单打开后进度条仍在视口内')
  await capture(main, 'list-metadata-menu.png')
  await js(
    main,
    `document.querySelector('[role=menu]').dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))`
  )
  await waitFor(() => js(main, `!document.querySelector('[role=menu]')`), '关闭菜单')
  assert.match(
    await js(main, `document.querySelector('[data-task-id="${task.id}"] time').textContent`),
    /^\d{2}:\d{2}$/
  )
  await js(main, `window.myTodo.archiveTask('${task.id}')`)
  await click(main, '.archive-view-switch [aria-label="已归档任务"]')
  await waitFor(
    () => js(main, `Boolean(document.querySelector('[data-archived-task-id="${task.id}"]'))`),
    '仅显示归档任务'
  )
  assert.equal(
    await js(main, `document.querySelectorAll('.workbench-list [data-task-id]').length`),
    0
  )
  assert.equal(
    await js(
      main,
      `document.querySelector('.archive-filter[aria-label^="已归档"]').getAttribute('aria-pressed')`
    ),
    'true'
  )
  const longTask = (
    await js(main, `window.myTodo.createTask('归档长任务' + 'veryLongDescription'.repeat(50))`)
  ).data
  await js(main, `window.myTodo.archiveTask('${longTask.id}')`)
  await waitFor(
    () => js(main, `Boolean(document.querySelector('[data-archived-task-id="${longTask.id}"]'))`),
    '长名称归档任务就绪'
  )
  const checkArchivedText = () =>
    js(
      main,
      `(() => {
    const row = document.querySelector('[data-archived-task-id="${longTask.id}"]');
    const name = row.querySelector('.note-archive-description');
    const actions = row.querySelector('.note-archive-actions');
    const style = getComputedStyle(name);
    return name.getBoundingClientRect().right <= actions.getBoundingClientRect().left && name.scrollWidth > name.clientWidth && style.textOverflow === 'ellipsis' && row.scrollWidth <= row.clientWidth;
  })()`
    )
  assert.equal(await checkArchivedText(), true, '长归档任务名称省略且不溢出操作区域')
  const originalSize = main.getSize()
  main.setSize(760, 650)
  assert.equal(await checkArchivedText(), true, '窄窗口归档任务名称仍在行内省略')
  await capture(main, 'archived-task-long-description.png')
  main.setSize(...originalSize)
  await click(main, '[aria-label="恢复：菜单布局回归"]')
  await waitFor(
    () => js(main, `!document.querySelector('[data-archived-task-id="${task.id}"]')`),
    '恢复归档任务'
  )
  await click(main, '.archive-view-switch [aria-label="当前任务"]')
  await waitFor(
    () => js(main, `Boolean(document.querySelector('[data-task-id="${task.id}"]'))`),
    '返回普通任务'
  )
  await click(main, '.workbench-nav [aria-label="习惯"]')
  const habit = (await js(main, `window.myTodo.createHabit('创建时间习惯')`)).data
  await waitFor(
    () => js(main, `Boolean(document.querySelector('[data-habit-id="${habit.id}"] time'))`),
    '习惯显示创建时间'
  )
  assert.match(
    await js(main, `document.querySelector('[data-habit-id="${habit.id}"] time').textContent`),
    /^\d{2}:\d{2}$/
  )
  await js(
    main,
    `Promise.all(Array.from({ length: 12 }, (_, i) => window.myTodo.createHabit('滚动习惯' + i)))`
  )
  await waitFor(
    () => js(main, `document.querySelectorAll('[data-habit-id]').length === 13`),
    '习惯长列表就绪'
  )
  assert.ok(
    await js(
      main,
      `window.innerWidth - document.querySelector('.workbench-habit-page').getBoundingClientRect().right <= 1`
    ),
    '习惯滚动条位于窗口右缘'
  )
  const habitHeading = await js(
    main,
    `[document.querySelector('.workbench-header h1').getBoundingClientRect().y, document.querySelector('.archive-view-switch').getBoundingClientRect().y]`
  )
  await js(main, `document.querySelector('.workbench-habit-page').scrollTop = 500`)
  assert.ok(
    await js(
      main,
      `document.querySelector('.workbench-habit-page').scrollTop > 0 && window.scrollY === 0`
    ),
    '习惯列表独立滚动'
  )
  assert.deepEqual(
    await js(
      main,
      `[document.querySelector('.workbench-header h1').getBoundingClientRect().y, document.querySelector('.archive-view-switch').getBoundingClientRect().y]`
    ),
    habitHeading,
    '习惯滚动时标题和切换栏固定'
  )
  await js(main, `document.querySelector('.workbench-habit-page').scrollTop = 0`)
  await capture(main, 'list-metadata-habits.png')
  const habitToolbar = await toolbarGeometry()
  assert.deepEqual(habitToolbar, taskToolbar, '任务与习惯的选择栏和加号位置一致')
  await click(main, `[data-habit-id="${habit.id}"] [data-testid=habit-archive]`)
  await waitFor(
    () => js(main, `!document.querySelector('[data-habit-id="${habit.id}"]')`),
    '习惯归档退出普通列表'
  )
  await click(main, '.archive-view-switch [aria-label="已归档习惯"]')
  await waitFor(
    () =>
      js(
        main,
        `Boolean(document.querySelector('[data-habit-id="${habit.id}"] [data-testid=habit-restore]'))`
      ),
    '图标切换归档习惯'
  )
  await click(main, '.archive-view-switch [aria-label="当前习惯"]')
  assert.equal(
    await js(
      main,
      `document.querySelector('.archive-filter[aria-label^="已归档"]').getAttribute('aria-pressed')`
    ),
    'false'
  )
  const idea = (await js(main, `window.myTodo.createInspiration('创建时间小记')`)).data
  await click(main, '.workbench-nav [aria-label="小记"]')
  await waitFor(
    () => js(main, `Boolean(document.querySelector('[data-inspiration-id="${idea.id}"] time'))`),
    '小记显示第二行创建时间'
  )
  assert.match(
    await js(main, `document.querySelector('[data-inspiration-id="${idea.id}"] time').textContent`),
    /^\d{2}:\d{2}$/
  )
  const dated = (await js(main, `window.myTodo.createInspiration('历史小记')`)).data
  await waitFor(
    () => js(main, `Boolean(document.querySelector('[data-inspiration-id="${dated.id}"]'))`),
    '第二条小记'
  )
  assert.equal(
    await js(main, `document.querySelector('.workbench-header h1').getBoundingClientRect().y`),
    habitHeading[0],
    '小记标题与习惯页同高'
  )
  assert.ok(
    await js(
      main,
      `Math.abs(document.querySelector('.inspiration-workbench').getBoundingClientRect().bottom - window.innerHeight) <= 1`
    ),
    '小记分组与列表用满标题下方空间'
  )
  await capture(main, 'list-metadata-inspirations.png')
  const ideaToolbar = await toolbarGeometry()
  assert.equal(ideaToolbar.bottom, taskToolbar.bottom, '小记标题分割线与任务、习惯同高')
  assert.equal(ideaToolbar.addY, taskToolbar.addY, '三个页面的加号同高')
  assert.ok(
    Math.abs(ideaToolbar.addRight - taskToolbar.addRight) <= 1,
    `三个页面的加号右侧位置一致：${JSON.stringify({ taskToolbar, ideaToolbar })}`
  )
}

import assert from 'node:assert/strict'

export async function listInteractionSmoke({ main, note, js, click, input, waitFor, capture }) {
  await waitFor(() => js(main, `Boolean(document.querySelector('.workbench-nav'))`), '主界面就绪')
  await click(main, '.workbench-nav [aria-label="习惯"]')
  await click(main, '[aria-label="新增习惯"]')
  await click(main, '.workbench-header h1')
  await waitFor(
    () => js(main, `!document.querySelector('[data-testid=habit-new]').checkVisibility()`),
    '习惯新增点击空白折叠'
  )
  await click(main, '.workbench-nav [aria-label="小记"]')
  await click(main, '[aria-label="新增小记"]')
  await input(main, '[aria-label="新增小记内容"]', '折叠保留草稿', null)
  await click(main, '.workbench-header h1')
  await waitFor(
    () => js(main, `!document.querySelector('[aria-label="新增小记内容"]')`),
    '小记新增点击空白折叠'
  )
  await click(main, '[aria-label="新增小记"]')
  assert.equal(
    await js(main, `document.querySelector('[aria-label="新增小记内容"]').value`),
    '折叠保留草稿'
  )
  await click(main, '[aria-label="清除新增小记内容"]')
  await click(main, '.workbench-nav [aria-label="任务"]')
  await click(main, '[aria-label="新增任务"]')
  await input(main, '[data-testid=task-new]', '仅回车创建', null)
  await click(main, '.workbench-header h1')
  assert.equal(
    (await js(main, 'window.myTodo.listToday()')).data.tasks.length,
    0,
    '主界面失焦不创建'
  )
  note.focus()
  await js(main, 'new Promise(resolve => setTimeout(resolve, 100))')
  assert.equal((await js(main, 'window.myTodo.listToday()')).data.tasks.length, 0, '窗口失焦不创建')
  main.focus()
  assert.equal(
    await js(main, `document.querySelector('[data-testid=task-new]').checkVisibility()`),
    false,
    '任务新增点击空白折叠'
  )
  await click(main, '[aria-label="新增任务"]')
  assert.equal(
    await js(main, `document.querySelector('[data-testid=task-new]').value`),
    '仅回车创建',
    '任务草稿保留'
  )
  await input(main, '[data-testid=task-new]', '仅回车创建')
  await waitFor(
    async () => (await js(main, 'window.myTodo.listToday()')).data.tasks.length === 1,
    'Enter创建'
  )
  await click(main, '[data-testid=task-description]')
  await waitFor(
    () => js(main, `Boolean(document.querySelector('.main-list-editor[data-testid=task-edit]'))`),
    '任务原地编辑'
  )
  assert.equal(
    await js(main, `Boolean(document.querySelector('.workbench-detail'))`),
    false,
    '正文编辑不打开详情'
  )
  await input(main, '[data-testid=task-edit]', '第一行\n第二行', null)
  await waitFor(
    () =>
      js(
        main,
        `(() => { const f=document.querySelector('[data-testid=task-edit]'); return f.clientHeight >= f.scrollHeight - 1 })()`
      ),
    '编辑框增高'
  )
  await click(main, '[aria-label="清除编辑任务描述"]')
  assert.equal(
    await js(
      main,
      `document.activeElement.value === '' && document.activeElement.dataset.testid === 'task-edit'`
    ),
    true,
    '共用清除交互'
  )
  await input(main, '[data-testid=task-edit]', '   ')
  await waitFor(
    () => js(main, `document.querySelector('.app-toast')?.textContent === '任务描述不能为空。'`),
    '空白校验使用小toast'
  )
  assert.equal(
    await js(main, `document.activeElement?.dataset.testid === 'task-edit'`),
    true,
    'toast不抢编辑焦点'
  )
  await capture(main, 'validation-toast.png')
  await waitFor(() => js(main, `!document.querySelector('.app-toast')`), 'toast自动消失')
  assert.equal(
    await js(main, `document.querySelector('[data-testid=task-edit]').value`),
    '   ',
    '提示消失保留草稿'
  )
  await input(main, '[data-testid=task-edit]', '修改后任务')
  await waitFor(
    () => js(main, `!document.querySelector('[data-testid=task-edit]')`),
    'Enter结束编辑'
  )
  const pinned = (await js(main, `window.myTodo.createTask('置顶任务')`)).data
  await js(main, `window.myTodo.setTaskPinned('${pinned.id}', true)`)
  await click(note, '.note-add-button')
  await input(note, '[data-testid=task-new]', '便签新任务', null)
  assert.equal(
    await js(note, `document.querySelector('.draft-clear').getBoundingClientRect().width`),
    12,
    '仅便签清除按钮缩至12px'
  )
  await input(note, '[data-testid=task-new]', '便签新任务')
  await waitFor(
    async () => (await js(note, 'window.myTodo.listToday()')).data.tasks.length === 3,
    '便签创建'
  )
  assert.deepEqual(
    (await js(note, 'window.myTodo.listToday()')).data.tasks.map((x) => x.description),
    ['置顶任务', '便签新任务', '修改后任务'],
    '新增排在置顶之后普通首位'
  )
  const long = '长任务内容'.repeat(30) + '末尾'
  await input(note, '[data-testid=task-new]', long)
  await waitFor(
    () =>
      js(
        note,
        `Array.from(document.querySelectorAll('[data-testid=task-description]')).some(x => x.textContent === ${JSON.stringify(long)})`
      ),
    '长任务呈现'
  )
  await js(
    note,
    `Array.from(document.querySelectorAll('[data-testid=task-description]')).find(x => x.textContent === ${JSON.stringify(long)}).click()`
  )
  await waitFor(
    () =>
      js(
        note,
        `(() => { const f=document.querySelector('[data-testid=task-edit]'); return f && f.scrollLeft > 0 && f.scrollLeft + f.clientWidth >= f.scrollWidth - 2 && f.selectionStart === f.value.length })()`
      ),
    '便签编辑光标及显示位置均在末尾'
  )
  await capture(note, 'note-edit-tail.png')
  await input(note, '[data-testid=task-edit]', long)
  await capture(main, 'shared-task-list.png')
  await click(main, '.workbench-nav [aria-label="小记"]')
  await waitFor(
    () => js(main, `Boolean(document.querySelector('.inspiration-list'))`),
    '小记列表就绪'
  )
  assert.equal(
    await js(
      main,
      `Math.abs(document.querySelector('.inspiration-list').getBoundingClientRect().right - innerWidth) <= 1`
    ),
    true,
    '列表滚动区域贴右侧窗口边缘'
  )
  await capture(main, 'inspiration-edge-layout.png')
  const habit = (await js(main, `window.myTodo.createHabit('共用习惯编辑')`)).data
  await click(main, '.workbench-nav [aria-label="习惯"]')
  await click(main, `[data-habit-id="${habit.id}"] [data-testid=habit-edit]`)
  assert.equal(
    await js(
      main,
      `document.querySelector('[data-testid=habit-edit-input]').closest('[data-habit-id]')?.dataset.habitId`
    ),
    habit.id,
    '习惯在当前列表行使用共用编辑框'
  )
  await click(main, '[aria-label="清除编辑习惯描述"]')
  assert.equal(
    await js(main, `document.activeElement?.dataset.testid`),
    'habit-edit-input',
    '清除保留焦点'
  )
  await input(main, '[data-testid=habit-edit-input]', '   ')
  await waitFor(
    () =>
      js(
        main,
        `document.querySelector('.app-toast')?.textContent === '习惯描述不能为空。'`
      ),
    '空白习惯保留编辑并提示'
  )
  await input(main, '[data-testid=habit-edit-input]', '习惯第一行\n习惯第二行')
  await waitFor(
    () => js(main, `!document.querySelector('[data-testid=habit-edit-input]')`),
    '习惯Enter提交结束编辑'
  )
  assert.equal(
    (await js(main, 'window.myTodo.listHabits()')).data.find((item) => item.id === habit.id)
      ?.description,
    '习惯第一行\n习惯第二行'
  )
  await click(main, `[data-habit-id="${habit.id}"] [data-testid=habit-description]`)
  await input(main, '[data-testid=habit-edit-input]', '习惯失焦保存', null)
  await js(main, `document.querySelector('[data-testid=habit-edit-input]').blur()`)
  await waitFor(
    async () =>
      (await js(main, 'window.myTodo.listHabits()')).data.find((item) => item.id === habit.id)
        ?.description === '习惯失焦保存',
    '习惯失焦保存'
  )
  await capture(main, 'shared-habit-list.png')
}

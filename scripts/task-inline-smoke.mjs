import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'
import { clipboard } from 'electron'

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
  const expand = (id) => `${row(id)} [aria-label^="展开子事项"]`
  const panel = (id) => `${row(id)} + .subitems-panel`
  const menu = async (id) => {
    await waitFor(
      () => js(main, `Boolean(document.querySelector('${row(id)} .task-more'))`),
      '菜单任务同步'
    )
    main.focus()
    await js(main, `document.querySelector('${row(id)} .task-more').focus()`)
    main.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' })
    main.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Down' })
    await waitFor(() => js(main, `Boolean(document.querySelector('[role=menu]'))`), '打开菜单')
  }
  await waitFor(() => js(main, `Boolean(document.querySelector('.workbench-nav'))`), '主界面就绪')
  if (phase.endsWith('restart')) {
    const saved = (await tasks()).find((t) => t.description.startsWith('行内任务甲'))
    assert.ok(saved)
    assert.equal(saved.progress, 33)
    assert.equal(saved.subitems.length, 3)
    assert.equal(
      await js(main, `document.querySelectorAll('.subitems-panel').length`),
      0,
      '重启默认折叠'
    )
    return
  }
  const description = '行内任务甲：' + '完整正文选择复制。'.repeat(18)
  const a = (await js(note, `window.myTodo.createTask(${JSON.stringify(description)})`)).data
  const b = (await js(note, `window.myTodo.createTask('行内任务乙')`)).data
  await js(note, `window.myTodo.convertToMultiDay('${b.id}')`)
  await js(note, `window.myTodo.setTaskProgress('${b.id}',33)`)
  await waitFor(() => js(main, `Boolean(document.querySelector('${expand(b.id)}'))`), '同步列表')
  assert.equal(await js(main, `document.querySelectorAll('.subitems-panel').length`), 0)
  await click(main, `${row(a.id)} [data-testid=task-description]`)
  const geometry = () =>
    js(
      main,
      `(() => {const list=document.querySelector('.workbench-list'), bar=document.querySelector('${row(b.id)} .task-mini-progress'); return [list.getBoundingClientRect().width,bar.getBoundingClientRect().x,bar.getBoundingClientRect().y,document.querySelector('.workbench-split').scrollTop]})()`
    )
  const before = await geometry()
  await js(
    main,
    `document.querySelector('${row(b.id)} .task-more').dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}))`
  )
  await waitFor(() => js(main, `Boolean(document.querySelector('[role=menu]'))`), '悬停打开')
  assert.equal(
    await js(main, `document.activeElement?.dataset.testid`),
    'task-edit',
    '悬停不抢编辑焦点'
  )
  assert.deepEqual(await geometry(), before, '菜单不改变列表与进度几何')
  await js(
    main,
    `document.querySelector('${row(b.id)} .task-more').dispatchEvent(new PointerEvent('pointerout',{bubbles:true,pointerType:'mouse',relatedTarget:document.querySelector('[role=menu]')})); document.querySelector('[role=menu]').dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}))`
  )
  await js(main, 'new Promise(r=>setTimeout(r,240))')
  assert.equal(
    await js(main, `Boolean(document.querySelector('[role=menu]'))`),
    true,
    '移入菜单保持'
  )
  await js(
    main,
    `document.querySelector('[role=menu]').dispatchEvent(new PointerEvent('pointerout',{bubbles:true,pointerType:'mouse',relatedTarget:document.body}))`
  )
  await waitFor(() => js(main, `!document.querySelector('[role=menu]')`), '移出关闭')
  await menu(a.id)
  assert.equal(await js(main, `document.querySelectorAll('[data-testid=task-details]').length`), 0)
  await click(main, '[data-testid=task-convert]')
  await waitFor(() => js(main, `Boolean(document.querySelector('${panel(a.id)}'))`), '转换自动展开')
  assert.equal((await get(a.id)).createdAt, a.createdAt)
  assert.equal((await get(a.id)).progress, 0)
  for (const value of [25, 50, 75, 100, 0]) {
    await click(
      main,
      `${panel(a.id)} .subitems-progress button:nth-child(${[0, 25, 50, 75, 100].indexOf(value) + 1})`
    )
    await waitFor(async () => (await get(a.id)).progress === value, `进度${value}`)
    assert.equal((await get(a.id)).completed, value === 100)
  }
  await js(
    main,
    `document.querySelector('${row(b.id)} .task-expand').click(); document.querySelector('${row(a.id)} .task-expand').click(); document.querySelector('${row(b.id)} .task-expand').click()`
  )
  await waitFor(
    () =>
      js(
        main,
        `Boolean(document.querySelector('${panel(b.id)}')) && document.querySelectorAll('.subitems-panel').length === 1`
      ),
    '快速切换只保留最后展开项'
  )
  await click(main, expand(a.id))
  const completed = (await js(note, `window.myTodo.createTask('已完成今天任务')`)).data
  await js(note, `window.myTodo.setTaskCompleted('${completed.id}',true)`)
  await menu(completed.id)
  assert.equal(
    await js(main, `Boolean(document.querySelector('[data-testid=task-convert]'))`),
    false,
    '完成今天任务不提供转换'
  )
  await click(main, '[data-testid=task-delete]')
  const habit = (await js(note, `window.myTodo.createHabit('行内习惯')`)).data
  const habitTask = (await tasks()).find((t) => t.habitId === habit.id)
  await menu(habitTask.id)
  assert.equal(
    await js(main, `Boolean(document.querySelector('[data-testid=task-convert]'))`),
    false,
    '习惯不提供转换'
  )
  assert.equal(
    await js(main, `document.querySelector('[data-testid=task-delete]').textContent.trim()`),
    '暂停一次'
  )
  await click(main, '[data-testid=task-delete]')
  await click(main, expand(b.id))
  assert.equal((await get(b.id)).progress, 33, '展开保留任意整数进度')
  assert.equal(await js(main, `document.querySelectorAll('.subitems-panel').length`), 1)
  await click(main, expand(a.id))
  await click(main, `${panel(a.id)} [aria-label="新增子事项"]`)
  await input(main, '[data-testid=subitem-new]', '首项草稿', null)
  await click(main, expand(b.id))
  await waitFor(async () => (await get(a.id)).subitems.length === 1, '切换保存有效草稿')
  await click(main, expand(a.id))
  const first = (await get(a.id)).subitems[0]
  const sub = `[data-subitem-id="${first.id}"]`
  await click(main, `${sub} [data-testid=subitem-description]`)
  await input(main, '[data-testid=subitem-edit]', '   ', null)
  await click(main, expand(b.id))
  assert.equal(
    await js(main, `Boolean(document.querySelector('${panel(a.id)}'))`),
    true,
    '空白阻止切换'
  )
  assert.equal(await js(main, `document.querySelector('[data-testid=subitem-edit]').value`), '   ')
  const pending = (await js(note, `window.myTodo.createTask('转换需先保存')`)).data
  await menu(pending.id)
  await click(main, '[data-testid=task-convert]')
  assert.equal((await get(pending.id)).kind, 'today', '转换也受草稿保存屏障保护')
  assert.equal(await js(main, `Boolean(document.querySelector('${panel(a.id)}'))`), true)
  await input(main, '[data-testid=subitem-edit]', '修复首项', null)
  await js(
    main,
    `document.querySelector('[data-testid=subitem-edit]').dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}))`
  )
  await click(main, expand(b.id))
  assert.equal(
    await js(main, `Boolean(document.querySelector('${panel(a.id)}'))`),
    true,
    '组合输入阻止切换'
  )
  await js(
    main,
    `document.querySelector('[data-testid=subitem-edit]').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}))`
  )
  await waitFor(
    async () => (await get(a.id)).subitems[0].description === '修复首项',
    '组合结束保存'
  )
  await click(main, `${sub} [data-testid=subitem-description]`)
  await input(main, '[data-testid=subitem-edit]', '保存失败保留', null)
  const db = new DatabaseSync(resolve(process.env.MYTODO_SMOKE_DATA, 'mytodo.sqlite'))
  try {
    db.exec(
      "CREATE TRIGGER issue36_fail BEFORE UPDATE ON task_subitems BEGIN SELECT RAISE(FAIL,'issue36 save failure'); END"
    )
    await click(main, expand(b.id))
    assert.equal(
      await js(main, `Boolean(document.querySelector('${panel(a.id)}'))`),
      true,
      '真实写入失败阻止切换'
    )
    assert.equal(
      await js(main, `document.querySelector('[data-testid=subitem-edit]').value`),
      '保存失败保留'
    )
  } finally {
    db.exec('DROP TRIGGER IF EXISTS issue36_fail')
    db.close()
  }
  await click(main, expand(b.id))
  await waitFor(
    async () => (await get(a.id)).subitems[0].description === '保存失败保留',
    '重试成功'
  )
  await click(main, expand(a.id))
  await click(main, `${row(a.id)} input[type=checkbox]`)
  await waitFor(async () => (await get(a.id)).completed, '父任务完成')
  assert.ok((await get(a.id)).subitems.every((x) => x.completed))
  await clipboard.writeText('保留剪贴板')
  await click(main, `${row(a.id)} [data-testid=task-description]`)
  await click(main, `${sub} [data-testid=subitem-description]`)
  assert.equal(await clipboard.readText(), '保留剪贴板', '点击不自动复制')
  assert.equal(
    await js(
      main,
      `document.querySelectorAll('[data-testid=task-edit],[data-testid=subitem-edit]').length`
    ),
    0,
    '完成正文只读'
  )
  await js(
    main,
    `(() => {const r=document.createRange();r.selectNodeContents(document.querySelector('${row(a.id)} [data-testid=task-description]'));const s=getSelection();s.removeAllRanges();s.addRange(r)})()`
  )
  main.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'C', modifiers: ['control'] })
  main.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'C', modifiers: ['control'] })
  await waitFor(async () => (await clipboard.readText()) === description, '全文可选择复制')
  await click(main, `${panel(a.id)} [aria-label="新增子事项"]`)
  await input(main, '[data-testid=subitem-new]', '第二项')
  await waitFor(async () => (await get(a.id)).subitems.length === 2, '完成父任务新增')
  assert.equal((await get(a.id)).completed, false)
  assert.equal((await get(a.id)).progress, 50)
  await input(main, '[data-testid=subitem-new]', '第三项')
  await waitFor(async () => (await get(a.id)).progress === 33, '三项比例')
  await click(main, '.workbench-nav [aria-label="习惯"]')
  await click(main, '.workbench-nav [aria-label="任务"]')
  assert.equal(
    await js(main, `Boolean(document.querySelector('${panel(a.id)}'))`),
    true,
    '切页保留展开'
  )
  await capture(main, 'task-inline-light.png')
  const state = (await js(note, 'window.myTodo.getWindowState()')).data
  await js(
    note,
    `window.myTodo.updateSettings(${JSON.stringify({ ...state.settings, appearance: 'dark' })})`
  )
  main.setSize(720, 650)
  await capture(main, 'task-inline-dark-narrow.png')
  await menu(a.id)
  assert.equal(
    await js(main, `Boolean(document.querySelector('[data-testid=task-convert]'))`),
    false
  )
  await click(main, '[data-testid=task-delete]')
  await waitFor(async () => !(await get(a.id)), '归档退出列表')
  assert.equal(
    await js(main, `Boolean(document.querySelector('[role=alertdialog]'))`),
    false,
    '归档无确认'
  )
  const archived = (await js(note, 'window.myTodo.listArchivedTasks()')).data.find(
    (t) => t.id === a.id
  )
  assert.equal(archived.progress, 33)
  assert.equal(archived.subitems.length, 3)
  await js(note, `window.myTodo.restoreTask('${a.id}')`)
  await waitFor(async () => Boolean(await get(a.id)), '恢复保留数据')
  // 最后一项删除保留进度，恢复手动控制。
  await click(main, expand(b.id))
  await click(main, `${panel(b.id)} [aria-label="新增子事项"]`)
  await input(main, '[data-testid=subitem-new]', '末项')
  await waitFor(async () => (await get(b.id)).subitems.length === 1, '末项创建')
  const last = (await get(b.id)).subitems[0]
  await click(main, `[data-subitem-id="${last.id}"] input[type=checkbox]`)
  await waitFor(async () => (await get(b.id)).progress === 100, '末项完成')
  await click(main, `[data-subitem-id="${last.id}"] [data-testid=subitem-delete]`)
  await waitFor(async () => ((await get(b.id)).subitems ?? []).length === 0, '删除末项')
  assert.equal((await get(b.id)).progress, 100)
  assert.equal((await get(b.id)).completed, true)
  await waitFor(
    () =>
      js(
        main,
        `document.querySelectorAll('${panel(b.id)} .subitems-progress button').length === 5`
      ),
    '末项删除后恢复五档控件'
  )
}

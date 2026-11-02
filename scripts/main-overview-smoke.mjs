import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'

export async function mainOverviewSmoke({
  main,
  note,
  js,
  click,
  waitFor,
  assert,
  dialog,
  capture
}) {
  await waitFor(
    () => js(main, 'Boolean(document.querySelector(".workbench-header h1"))'),
    '主界面就绪'
  )
  const counts = () =>
    js(
      main,
      `Array.from(document.querySelectorAll('.workbench-nav .nav-count')).map(x => Number(x.textContent))`
    )
  assert.deepEqual(await counts(), [0, 0, 0], '三个类别初始显示总数')
  const task = (await js(note, `window.myTodo.createTask('今天任务总数验证')`)).data
  const multi = (await js(note, `window.myTodo.createTask('多天任务筛选验证')`)).data
  await js(note, `window.myTodo.convertToMultiDay('${multi.id}')`)
  const habit = (await js(note, `window.myTodo.createHabit('习惯总数验证')`)).data
  const oldIdea = (await js(note, `window.myTodo.createInspiration('昨天的灵感')`)).data
  const legacyIdea = (await js(note, `window.myTodo.createInspiration('无日期的旧灵感')`)).data
  const db = new DatabaseSync(resolve(process.env.MYTODO_SMOKE_DATA, 'mytodo.sqlite'))
  try {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    db.prepare('UPDATE inspirations SET created_at = ? WHERE id = ?').run(
      yesterday.toISOString(),
      oldIdea.id
    )
    db.prepare('UPDATE inspirations SET created_at = NULL WHERE id = ?').run(legacyIdea.id)
  } finally {
    db.close()
  }
  const idea = (await js(note, `window.myTodo.createInspiration('灵感总数验证')`)).data
  await waitFor(
    async () => JSON.stringify(await counts()) === '[3,1,1]',
    '跨窗口同步当天数量，历史与无日期灵感不计入'
  )
  await click(main, `[data-task-id="${task.id}"] input[type=checkbox]`)
  await waitFor(
    () =>
      js(
        main,
        `document.querySelector('.workbench-completion').textContent.trim() === '1 / 3 已完成'`
      ),
    '完成统计同步'
  )
  assert.deepEqual(await counts(), [3, 1, 1], '完成任务后仍显示任务总数')
  // 保留打开的任务详情，验证隐藏多天任务时详情一并隐藏。
  await click(main, `[data-task-id="${multi.id}"] [data-testid=task-description]`)
  await js(
    note,
    `(async () => {
    const state = (await window.myTodo.getWindowState()).data;
    const result = await window.myTodo.updateSettings({ ...state.settings, showMultiDay: false });
    if (!result.ok) throw new Error(result.error);
  })()`
  )
  await waitFor(
    () =>
      js(
        main,
        `!document.querySelector('[data-task-id="${multi.id}"]') && !document.querySelector('.workbench-detail')`
      ),
    '关闭持续推进同步主界面列表与详情'
  )
  assert.deepEqual(await counts(), [2, 1, 1], '隐藏的持续推进不计入总数')
  await js(note, `window.myTodo.archiveTask('${task.id}')`)
  await waitFor(async () => (await counts())[0] === 1, '归档更新任务总数')
  await click(main, '[data-testid=task-archive-toggle]')
  const row = `[data-archived-task-id="${task.id}"]`
  await waitFor(
    () => js(main, `Boolean(document.querySelector('${row}')?.checkVisibility())`),
    '主界面显示归档任务'
  )
  assert.equal(
    await js(
      main,
      `document.querySelector('${row}').querySelectorAll('input,textarea,[draggable=true]').length`
    ),
    0,
    '归档只读'
  )
  await capture(main, 'main-overview-archive.png')
  await click(main, `[aria-label="恢复：${task.description}"]`)
  await waitFor(async () => (await counts())[0] === 2, '主界面恢复更新总数')
  await js(note, `window.myTodo.archiveTask('${task.id}')`)
  await waitFor(async () => (await counts())[0] === 1, '再次归档同步')
  dialog.showMessageBox = async () => {
    throw new Error('删除不应使用系统确认')
  }
  await click(main, `[aria-label="永久删除：${task.description}"]`)
  await waitFor(
    () => js(main, 'document.querySelectorAll("[role=alertdialog]").length === 1'),
    '永久删除只确认一次'
  )
  await click(main, '[data-testid=delete-cancel]')
  assert.ok(
    (await js(main, 'window.myTodo.listArchivedTasks()')).data.some((x) => x.id === task.id),
    '取消删除保留归档'
  )
  await click(main, `[aria-label="永久删除：${task.description}"]`)
  await click(main, '[data-testid=delete-confirm]')
  await waitFor(() => js(main, `!document.querySelector('${row}')`), '主界面永久删除归档')
  await js(note, `window.myTodo.archiveInspiration('${idea.id}')`)
  await waitFor(async () => (await counts())[2] === 0, '归档灵感同步总数')
  await js(note, `window.myTodo.restoreInspiration('${idea.id}')`)
  await waitFor(async () => (await counts())[2] === 1, '恢复灵感同步总数')
  const habitTask = (await js(note, 'window.myTodo.listToday()')).data.tasks.find(
    (x) => x.habitId === habit.id
  )
  await js(note, `window.myTodo.skipHabitTask('${habitTask.id}')`)
  await waitFor(
    async () => JSON.stringify(await counts()) === '[0,0,1]',
    '暂停今天的习惯任务后同步当天数量'
  )
  assert.ok(
    (await js(note, 'window.myTodo.listHabits()')).data.some((x) => x.id === habit.id),
    '习惯仍保留，侧栏只统计当天任务'
  )
  await js(note, `window.myTodo.deleteHabit('${habit.id}')`)
  await waitFor(async () => (await counts())[1] === 0, '删除习惯同步总数')
  await js(
    note,
    `(async () => {
    const state = (await window.myTodo.getWindowState()).data;
    await window.myTodo.updateSettings({ ...state.settings, showMultiDay: true });
  })()`
  )
  await waitFor(async () => (await counts())[0] === 1, '重新开启持续推进恢复总数')
  await capture(main, 'main-overview.png')
}

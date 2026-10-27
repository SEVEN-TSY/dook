import assert from 'node:assert/strict'

export async function subitemsSmoke({ phase, main, note, input, click, js, waitFor }) {
  const description = '子事项回归：整理需求'
  const tasks = async () => (await js(main, 'window.myTodo.listToday()')).data.tasks
  const find = async () => (await tasks()).find((task) => task.description === description)
  const row = (id) => `[data-task-id="${id}"]`
  if (phase === 'create') {
    await input(main, '[data-testid=task-new]', description)
    const task = await waitFor(find, '新增子事项所属任务')
    await click(note, `${row(task.id)} [data-testid=subitems-toggle]`)
    await input(note, `${row(task.id)} [data-testid=subitem-new]`, '收集反馈')
    await waitFor(async () => (await find())?.subitems?.length === 1, '首个子事项自动转换')
    assert.equal((await find()).kind, 'multi-day')
    await input(note, `${row(task.id)} [data-testid=subitem-new]`, '梳理边界')
    await waitFor(async () => (await find())?.subitems?.length === 2, '新增第二个子事项')
    const first = (await find()).subitems[0]
    await click(note, `[data-subitem-id="${first.id}"] [data-testid=subitem-description]`)
    await input(note, '[data-testid=subitem-edit]', '收集用户反馈')
    await waitFor(
      async () => (await find())?.subitems?.[0]?.description === '收集用户反馈',
      '编辑子事项同步'
    )
    await click(note, `[data-subitem-id="${first.id}"] input[type=checkbox]`)
    await waitFor(async () => (await find())?.progress === 50, '子事项完成比例同步')
    assert.equal(
      await js(
        main,
        `document.querySelector('${row(task.id)} [data-testid=task-progress]').disabled`
      ),
      true,
      '有子事项进度只读'
    )
    await click(main, `${row(task.id)} > input[type=checkbox]`)
    await waitFor(
      async () => (await find())?.subitems?.every((item) => item.completed),
      '整条完成同步全部子事项'
    )
    await click(main, `${row(task.id)} > input[type=checkbox]`)
    await waitFor(
      async () => (await find())?.subitems?.every((item) => !item.completed),
      '整条取消同步全部子事项'
    )
    await input(note, `${row(task.id)} [data-testid=subitem-new]`, '隐藏前保存子事项', null)
    await js(note, 'window.myTodo.hideWindow()')
    await waitFor(() => !note.isVisible(), '等待子事项保存后隐藏')
    await js(main, `window.myTodo.openWindow('note')`)
    await waitFor(() => note.isVisible(), '恢复子事项窗口')
    await waitFor(async () => (await find())?.subitems?.length === 3, '隐藏握手保存子事项')
  } else if (phase === 'restart') {
    const task = await waitFor(find, '子事项任务重启保留')
    assert.deepEqual(
      task.subitems.map((item) => item.description),
      ['收集用户反馈', '梳理边界', '隐藏前保存子事项']
    )
    assert.equal(task.kind, 'multi-day')
    await click(note, `${row(task.id)} [data-testid=subitems-toggle]`)
    for (const item of task.subitems) {
      await click(note, `[data-subitem-id="${item.id}"] [data-testid=subitem-delete]`)
      await waitFor(
        async () => !(await find())?.subitems?.some((candidate) => candidate.id === item.id),
        '删除子事项同步'
      )
    }
    assert.equal(
      await js(
        main,
        `document.querySelector('${row(task.id)} [data-testid=task-progress]').disabled`
      ),
      false,
      '删除最后子事项恢复手动进度'
    )
  }
}

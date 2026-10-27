/** 在既有任务数量断言之后调用；删除任务以保持其他场景的数量预期。 */
export async function habitsSmoke({ phase, main, note, input, click, js, waitFor, assert }) {
  const description = '习惯回归：检查构建'
  if (phase === 'create') {
    await input(main, '[data-testid=habit-new]', description)
    await waitFor(
      async () =>
        (await js(main, 'window.myTodo.listHabits()')).data.some(
          (habit) => habit.description === description
        ),
      '主界面创建习惯'
    )
    const task = (await js(main, 'window.myTodo.listToday()')).data.tasks.find(
      (task) => task.description === description
    )
    assert.ok(task.habitId)
    for (const window of [main, note]) {
      await waitFor(
        () =>
          js(
            window,
            `Boolean(document.querySelector('[data-task-id="${task.id}"] [data-testid=habit-source]'))`
          ),
        '双窗口习惯来源标识'
      )
    }
    await click(note, `[data-task-id="${task.id}"] input[type=checkbox]`)
    await waitFor(
      async () =>
        (await js(main, 'window.myTodo.listToday()')).data.tasks.find((item) => item.id === task.id)
          ?.completed,
      '习惯任务完成同步'
    )
    assert.deepEqual(await js(note, `window.myTodo.deleteTask(${JSON.stringify(task.id)})`), {
      ok: true,
      data: true
    })
    await waitFor(
      async () =>
        !(await js(main, 'window.myTodo.listToday()')).data.tasks.some(
          (item) => item.id === task.id
        ),
      '删除习惯任务同步'
    )
  } else if (phase === 'restart') {
    const habits = (await js(main, 'window.myTodo.listHabits()')).data
    const habit = habits.find((habit) => habit.description === description)
    assert.ok(habit, '习惯重启保留')
    assert.equal(
      (await js(note, 'window.myTodo.listToday()')).data.tasks.some(
        (task) => task.habitId === habit.id
      ),
      false,
      '重启不重建当天已删除的习惯任务'
    )
  }
}

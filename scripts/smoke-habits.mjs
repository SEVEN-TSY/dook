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
  await habitMaintenanceSmoke({ phase, main, note, input, click, js, waitFor, assert })
}

async function habitMaintenanceSmoke({ phase, main, note, input, click, js, waitFor, assert }) {
  const tasks = async () => (await js(main, 'window.myTodo.listToday()')).data.tasks
  const habits = async () => (await js(main, 'window.myTodo.listHabits()')).data
  const persistedDescription = '习惯复用重启检查'
  if (phase === 'create') {
    for (const [index, window] of [main, note].entries()) {
      const description = `复用任务${index}`
      const before = (await tasks()).length
      await input(window, '[data-testid=task-new]', description)
      const task = await waitFor(
        async () => (await tasks()).find((item) => item.description === description),
        '新增待复用今天任务'
      )
      await click(window, `[data-task-id="${task.id}"] input[type=checkbox]`)
      await waitFor(
        async () => (await tasks()).find((item) => item.id === task.id)?.completed,
        '复用前完成任务'
      )
      await click(window, `[data-task-id="${task.id}"] [data-testid=task-to-habit]`)
      const linked = await waitFor(
        async () => (await tasks()).find((item) => item.id === task.id && item.habitId),
        '原任务关联习惯'
      )
      assert.equal(linked.completed, true, '添加为习惯保留完成状态')
      assert.equal((await tasks()).length, before + 1, '添加为习惯不额外生成任务')
      const duplicate = await js(
        window,
        `window.myTodo.createHabitFromTask(${JSON.stringify(task.id)})`
      )
      assert.equal(duplicate.data.id, linked.habitId, '重复操作复用习惯')
      await waitFor(
        () => js(main, `Boolean(document.querySelector('[data-habit-id="${linked.habitId}"]'))`),
        '主界面习惯同步'
      )
      await click(main, `[data-habit-id="${linked.habitId}"] [data-testid=habit-edit]`)
      await input(main, '[data-testid=habit-edit-input]', `${description}未来内容`)
      await waitFor(
        async () =>
          (await habits()).find((item) => item.id === linked.habitId)?.description ===
          `${description}未来内容`,
        '编辑习惯保存'
      )
      assert.equal(
        (await tasks()).find((item) => item.id === task.id).description,
        description,
        '编辑习惯保留已有任务内容'
      )
      await click(main, `[data-habit-id="${linked.habitId}"] [data-testid=habit-archive]`)
      await waitFor(
        async () => !(await habits()).some((item) => item.id === linked.habitId),
        '删除习惯'
      )
      for (const target of [main, note]) {
        await waitFor(
          () => js(target, `!document.querySelector('[data-task-id="${task.id}"]')`),
          '删除习惯后当天任务从两窗口移除'
        )
      }
      assert.equal(
        (await tasks()).find((item) => item.id === task.id),
        undefined
      )
      await waitFor(async () => (await tasks()).length === before, '清理维护场景任务')
    }
    await input(note, '[data-testid=task-new]', persistedDescription)
    const task = await waitFor(
      async () => (await tasks()).find((item) => item.description === persistedDescription),
      '新增重启复用任务'
    )
    await click(note, `[data-task-id="${task.id}"] [data-testid=task-to-habit]`)
    await waitFor(
      async () => (await tasks()).find((item) => item.id === task.id)?.habitId,
      '重启任务关联习惯'
    )
    await js(note, `window.myTodo.deleteTask(${JSON.stringify(task.id)})`)
    await waitFor(
      async () => !(await tasks()).some((item) => item.id === task.id),
      '删除当天复用任务'
    )
  } else if (phase === 'restart') {
    const habit = (await habits()).find((item) => item.description === persistedDescription)
    assert.ok(habit, '从今天任务添加的习惯重启保留')
    assert.equal(
      (await tasks()).some((item) => item.habitId === habit.id),
      false,
      '重启不重新生成当天已删除的复用任务'
    )
  }
}

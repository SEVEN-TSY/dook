import assert from 'node:assert/strict'

/** 在真实双窗口上验收灵感；由统一Electron smoke负责应用生命周期。 */
export async function inspirationSmoke({ main, note, phase, js, click, input, waitFor }) {
  const ideas = async (window) => (await js(window, 'window.myTodo.listInspirations()')).data
  const mode = (window, value) =>
    waitFor(
      () =>
        js(
          window,
          `document.querySelector('[data-testid=task-new]').dataset.newKind === ${JSON.stringify(value)}`
        ),
      `新增类别${value}`
    )
  const count = (window, expected) =>
    waitFor(
      () =>
        js(
          window,
          `document.querySelector('[data-testid=inspiration-count]').textContent === '${expected}'`
        ),
      `灵感数量${expected}`
    )
  assert.equal(
    await js(note, `document.querySelector('[data-testid=task-new]').dataset.newKind`),
    'task'
  )
  assert.equal(
    await js(
      note,
      `document.querySelector('[data-testid=inspirations-toggle]').getAttribute('aria-expanded')`
    ),
    'false'
  )
  if (phase === 'create') {
    const before = (await js(note, 'window.myTodo.listToday()')).data.tasks
    await click(note, '[data-testid=new-kind-inspiration]')
    await mode(note, 'inspiration')
    await input(note, '[data-testid=task-new]', '灵感分类草稿', null)
    await click(note, '[data-testid=new-kind-task]')
    await mode(note, 'task')
    await count(main, 1)
    await count(note, 1)
    assert.deepEqual(
      (await js(note, 'window.myTodo.listToday()')).data.tasks,
      before,
      '灵感保存不产生今天任务'
    )
    await click(note, '[data-testid=inspirations-toggle]')
    await click(main, '[data-testid=inspirations-toggle]')
    await click(note, '[data-testid=inspiration-summary]')
    await click(note, '[data-testid=inspiration-edit-original]')
    await input(note, '[data-testid=inspiration-edit]', '灵感整合工具')
    await waitFor(
      () =>
        js(
          main,
          `document.querySelector('[data-testid=inspiration-summary]').textContent === '灵感整合工具'`
        ),
      '原始想法跨窗口更新'
    )
    const append = async (content, submit = true) => {
      note.focus()
      await js(
        note,
        `(() => {
        const field = document.querySelector('[data-testid=inspiration-addition]');
        field.focus();
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, ${JSON.stringify(content)});
        field.dispatchEvent(new Event('input', { bubbles: true }));
      })()`
      )
      if (submit) {
        note.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
        note.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
        await waitFor(
          () =>
            js(note, `document.querySelector('[data-testid=inspiration-addition]').value === ''`),
          '补充保存后清空草稿'
        )
      }
    }
    const topic = await js(
      main,
      `(async () => { const idea = (await window.myTodo.listInspirations()).data[0]; return window.myTodo.createInspirationTopic('重启主题', idea.id) })()`
    )
    assert.equal(topic.ok, true)
    await append('先梳理需求')
    await append('再探索实现')
    await append('隐藏前补充', false)
    await js(note, 'window.myTodo.hideWindow()')
    await waitFor(() => !note.isVisible(), '等待灵感草稿保存后隐藏')
    await js(main, `window.myTodo.openWindow('note')`)
    await waitFor(() => note.isVisible(), '恢复灵感窗口')
  } else {
    await count(note, 1)
    await count(main, 1)
    await click(note, '[data-testid=inspirations-toggle]')
  }
  const saved = await ideas(note)
  assert.equal(saved.length, 1)
  assert.equal(saved[0].description, '灵感整合工具')
  const topics = (await js(main, 'window.myTodo.listInspirationTopics()')).data
  assert.equal(topics.find((topic) => topic.name === '重启主题')?.id, saved[0].topicIds[0])
  assert.deepEqual(
    saved[0].additions.map((item) => item.content),
    ['先梳理需求', '再探索实现', '隐藏前补充']
  )
  assert.deepEqual(await ideas(main), saved, '双窗口与重启读到相同灵感')
}

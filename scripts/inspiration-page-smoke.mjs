import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'

/** 小记页面验收贯穿真实React、桌面桥接、AppService与SQLite。 */
export async function inspirationPageSmoke({
  main,
  note,
  phase,
  js,
  click,
  input,
  waitFor,
  capture
}) {
  await waitFor(() => js(main, `Boolean(document.querySelector('.workbench-nav'))`), '主界面就绪')
  if (phase.endsWith('create')) {
    for (const [page, label, field] of [
      ['任务', '新增任务', '新增任务描述'],
      ['习惯', '新增习惯', '新增习惯描述']
    ]) {
      await click(main, `.workbench-nav [aria-label="${page}"]`)
      await click(main, `[aria-label="${label}"]`)
      await input(main, `[aria-label="${field}"]`, '待清除草稿', null)
      await click(main, `[aria-label="清除${field}"]`)
      assert.equal(
        await js(
          main,
          `document.activeElement?.getAttribute('aria-label') === '${field}' && document.activeElement.value === ''`
        ),
        true,
        `${page}使用公共清除行为，保留焦点`
      )
    }
  }
  await click(main, '.workbench-nav [aria-label="小记"]')
  await waitFor(
    () => js(main, `Boolean(document.querySelector('.inspiration-group-title'))`),
    '小记分组就绪'
  )
  assert.deepEqual(
    await js(
      main,
      `Array.from(document.querySelectorAll('.inspiration-views button')).map(x => [x.textContent, x.getAttribute('aria-pressed')])`
    ),
    [
      ['主题', 'true'],
      ['日期', 'false']
    ],
    '主题视角在前并默认选中'
  )
  assert.equal(
    await js(main, `document.querySelector('.inspiration-group-title').textContent`),
    '未归类',
    '首次进入及重启默认未归类'
  )
  if (phase.endsWith('create')) {
    await click(main, '[aria-label="新增小记"]')
    await input(main, '[aria-label="新增小记内容"]', '清除这份草稿', null)
    await capture(main, 'inspiration-create-clear.png')
    await click(main, '[aria-label="清除新增小记内容"]')
    assert.equal(
      await js(
        main,
        `document.activeElement?.getAttribute('aria-label') === '新增小记内容' && document.activeElement.value === ''`
      ),
      true,
      '新增清除后保留焦点及展开'
    )
    assert.equal((await js(main, `window.myTodo.listInspirations()`)).data.length, 0, '清除不提交')
    assert.equal(
      await js(main, `Boolean(document.querySelector('[aria-label="清除新增小记内容"]'))`),
      false,
      '空内容隐藏清除'
    )
    await input(main, '[aria-label="新增小记内容"]', '完整正文第一行', null)
    await js(
      main,
      `document.querySelector('[aria-label="新增小记内容"]').dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', isComposing:true, bubbles:true}))`
    )
    assert.equal(
      (await js(main, `window.myTodo.listInspirations()`)).data.length,
      0,
      '输入法选字不提交'
    )
    main.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter', modifiers: ['control'] })
    main.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter', modifiers: ['control'] })
    await waitFor(
      () => js(main, `document.querySelector('[aria-label="新增小记内容"]').value.includes('\\n')`),
      'Ctrl+Enter保留换行'
    )
    await input(main, '[aria-label="新增小记内容"]', '完整正文第一行\n第二行\n第三行')
    await waitFor(
      () => js(main, `Boolean(document.querySelector('[data-testid=inspiration-summary]'))`),
      'Enter保存新增'
    )
    const preview = await js(
      main,
      `(() => { const span = document.querySelector('.inspiration-summary > span'); return {height:span.getBoundingClientRect().height, line:Number.parseFloat(getComputedStyle(span).lineHeight)} })()`
    )
    assert.ok(preview.height <= preview.line + 1, '正文仅预览一行')
    await click(main, '[data-testid=inspiration-summary]')
    await waitFor(
      () => js(main, `Boolean(document.querySelector('[aria-label="清除编辑原始想法"]'))`),
      '正文编辑展开'
    )
    await js(
      main,
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
    )
    assert.equal(
      await js(
        main,
        `(() => { const f = document.querySelector('[data-testid=inspiration-edit]'); return f.clientHeight >= f.scrollHeight - 1 })()`
      ),
      true,
      '多行正文编辑自动增高，完整显示内容'
    )
    await capture(main, 'inspiration-edit-clear.png')
    await click(main, '[aria-label="清除编辑原始想法"]')
    assert.equal(
      await js(
        main,
        `document.activeElement?.dataset.testid === 'inspiration-edit' && document.activeElement.value === ''`
      ),
      true,
      '正文清除保留焦点'
    )
    await js(main, `document.querySelector('[data-testid=inspiration-edit]').blur()`)
    await waitFor(
      () => js(main, `Boolean(document.querySelector('[role=alert]'))`),
      '已有正文清空不可保存'
    )
    assert.equal(
      (await js(main, `window.myTodo.listInspirations()`)).data[0].description,
      '完整正文第一行\n第二行\n第三行',
      '空白未截断持久化正文'
    )
    await input(main, '[data-testid=inspiration-edit]', '失焦保存后的正文', null)
    await js(main, `document.querySelector('[data-testid=inspiration-edit]').blur()`)
    await waitFor(
      async () =>
        (await js(main, `window.myTodo.listInspirations()`)).data[0].description ===
        '失焦保存后的正文',
      '正文原有失焦保存'
    )

    const idea = (await js(main, `window.myTodo.createInspiration('保留正文和历史补充')`)).data
    assert.equal(
      (
        await js(
          main,
          `window.myTodo.appendInspiration('${idea.id}', '历史补充仍可读取', 'history-addition')`
        )
      ).ok,
      true
    )
    await waitFor(
      () => js(main, `Boolean(document.querySelector('[data-inspiration-id]'))`),
      '小记显示'
    )
    assert.equal(
      await js(
        main,
        `Boolean(document.querySelector('[data-testid=inspiration-supplement], .inspiration-detail, .inspiration-additions, [data-testid=inspiration-addition]'))`
      ),
      false,
      '普通小记不展示详情和补充入口'
    )
    await click(main, '[aria-label="归档小记"]')
    await js(
      main,
      `Array.from(document.querySelectorAll('.inspiration-views button')).find(x => x.textContent === '日期').click()`
    )
    await js(
      main,
      `Array.from(document.querySelectorAll('.inspiration-nav-item .inspiration-heading')).find(x => x.textContent === '已归档小记').click()`
    )
    await waitFor(
      () => js(main, `Boolean(document.querySelector('[aria-label="恢复小记"]'))`),
      '已归档小记显示'
    )
    await click(main, '.inspiration-summary')
    assert.equal(
      await js(
        main,
        `Boolean(document.querySelector('.inspiration-detail, .inspiration-additions, [data-testid=inspiration-addition]'))`
      ),
      false,
      '已归档小记也不展示详情和补充'
    )
    // 两视角分别记住分组、已加载页数和滚动位置。
    const selectView = async (label) => {
      await js(
        main,
        `Array.from(document.querySelectorAll('.inspiration-views button')).find(x => x.textContent === '${label}').click()`
      )
    }
    const selectGroup = async (label) => {
      await js(
        main,
        `Array.from(document.querySelectorAll('.inspiration-nav-item .inspiration-heading')).find(x => x.textContent === '${label}').click()`
      )
      await waitFor(
        () =>
          js(main, `document.querySelector('.inspiration-group-title').textContent === '${label}'`),
        `选择分组${label}`
      )
    }
    await js(
      main,
      `(async () => { const topic = (await window.myTodo.createInspirationTopic('记忆主题')).data; for (let i=0;i<28;i++) await window.myTodo.createInspiration('分页正文'+i, topic.id); })()`
    )
    await selectGroup('今天')
    await waitFor(
      () => js(main, `document.querySelectorAll('.inspiration-item').length === 20`),
      '日期首屏分页'
    )
    await js(main, `document.querySelector('.inspiration-list').scrollTop = 10000`)
    await waitFor(
      () => js(main, `document.querySelectorAll('.inspiration-item').length >= 28`),
      '日期下滑加载'
    )
    await js(main, `document.querySelector('.inspiration-list').scrollTop = 240`)
    await selectView('主题')
    await selectGroup('记忆主题')
    await waitFor(
      () => js(main, `document.querySelectorAll('.inspiration-item').length === 20`),
      '主题首屏分页'
    )
    await js(main, `document.querySelector('.inspiration-list').scrollTop = 10000`)
    await waitFor(
      () => js(main, `document.querySelectorAll('.inspiration-item').length === 28`),
      '主题下滑加载'
    )
    await js(main, `document.querySelector('.inspiration-list').scrollTop = 160`)
    await selectView('日期')
    await waitFor(
      () =>
        js(
          main,
          `document.querySelector('.inspiration-group-title').textContent === '今天' && document.querySelectorAll('.inspiration-item').length >= 28 && document.querySelector('.inspiration-list').scrollTop === 240`
        ),
      '恢复日期分组和滚动位置'
    )
    await selectView('主题')
    await waitFor(
      () =>
        js(
          main,
          `document.querySelector('.inspiration-group-title').textContent === '记忆主题' && document.querySelectorAll('.inspiration-item').length === 28 && document.querySelector('.inspiration-list').scrollTop === 160`
        ),
      '恢复主题分组和滚动位置'
    )
    await click(main, '[aria-label="新增小记"]')
    await input(main, '[aria-label="新增小记内容"]', '主题内新增')
    await waitFor(
      async () =>
        (await js(main, `window.myTodo.listInspirations()`)).data.some(
          (x) => x.description === '主题内新增' && x.topicIds.length === 1
        ),
      '主题内新增保留自动归集'
    )
    const db = new DatabaseSync(resolve(process.env.MYTODO_SMOKE_DATA, 'mytodo.sqlite'))
    try {
      db.exec(
        `CREATE TRIGGER fail_inspiration BEFORE INSERT ON inspirations WHEN NEW.description = '失败后重试' BEGIN SELECT RAISE(ABORT, '测试保存失败'); END`
      )
      await input(main, '[aria-label="新增小记内容"]', '失败后重试')
      await waitFor(
        () => js(main, `document.body.textContent.includes('测试保存失败')`),
        '保存失败提示'
      )
      assert.equal(
        await js(main, `document.querySelector('[aria-label="新增小记内容"]').value`),
        '失败后重试',
        '保存失败保留草稿'
      )
      db.exec('DROP TRIGGER fail_inspiration')
      await input(main, '[aria-label="新增小记内容"]', '失败后重试')
      await waitFor(
        () => js(main, `document.querySelector('[aria-label="新增小记内容"]').value === ''`),
        '保存失败后原草稿可重试'
      )
    } finally {
      db.exec('DROP TRIGGER IF EXISTS fail_inspiration')
      db.close()
    }
    // 便签两类记录共用单行输入，连续新增后同步主界面。
    await click(note, '.note-add-button')
    for (const [kind, clearLabel, texts] of [
      ['task', '清除新增任务描述', ['便签任务一', '便签任务二']],
      ['inspiration', '清除新增小记', ['便签小记一', '便签小记二']]
    ]) {
      await click(note, `[data-testid=new-kind-${kind}]`)
      assert.equal(
        await js(note, `document.querySelector('[data-testid=task-new]').tagName`),
        'INPUT',
        '便签使用单行输入'
      )
      await input(note, '[data-testid=task-new]', '可清除草稿', null)
      await click(note, `[aria-label="${clearLabel}"]`)
      assert.equal(
        await js(
          note,
          `document.activeElement?.dataset.testid === 'task-new' && document.activeElement.value === ''`
        ),
        true,
        '便签清除保持展开与焦点'
      )
      for (const text of texts) {
        await input(note, '[data-testid=task-new]', text)
        await waitFor(
          () =>
            js(
              note,
              `document.querySelector('[data-testid=task-new]').value === '' && document.activeElement?.dataset.testid === 'task-new'`
            ),
          '连续新增清空并保留焦点'
        )
      }
    }
    assert.equal(
      await js(note, `Boolean(document.querySelector('.note-add-controls.is-inspiration'))`),
      true,
      '小记类别暖色状态保留'
    )
    assert.equal(
      await js(note, `document.querySelector('[data-testid=task-new]').placeholder`),
      '写下小记…'
    )
    await js(note, `document.querySelector('[data-testid=task-new]').blur()`)
    await waitFor(
      () => js(note, `!document.querySelector('.note-bottom').classList.contains('is-editing')`),
      '便签失焦保存后收起'
    )
    assert.equal(
      await js(note, `Boolean(document.querySelector('[data-inspiration-id]'))`),
      false,
      '便签不新增小记正文列表'
    )
    const noteIdeas = (await js(note, `window.myTodo.listInspirations()`)).data
    assert.deepEqual(
      (await js(main, `window.myTodo.listInspirations()`)).data,
      noteIdeas,
      '双窗口读取同一持久化数据'
    )
    await selectGroup('未归类')
    await waitFor(
      () =>
        js(
          main,
          `Array.from(document.querySelectorAll('.inspiration-summary')).some(x => x.textContent === '便签小记二')`
        ),
      '便签小记同步主界面'
    )
    await capture(main, 'inspiration-page-wide.png')
    main.setSize(760, 680)
    await capture(main, 'inspiration-page-narrow.png')
    await capture(note, 'inspiration-note-input.png')
    // 退出前停在其他主题；重启应回到未归类。
    await selectGroup('记忆主题')
  }
  const saved = (await js(main, `window.myTodo.listInspirationPage(0, 20, {kind:'archive'})`)).data
    .items[0]
  assert.equal(saved.description, '保留正文和历史补充')
  assert.deepEqual(
    saved.additions.map((x) => x.content),
    ['历史补充仍可读取'],
    '移除界面后历史补充经原接口及重启仍可读取'
  )
}

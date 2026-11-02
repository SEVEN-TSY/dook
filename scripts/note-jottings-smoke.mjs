import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'

export async function noteJottingsSmoke({ main, note, phase, js, click, input, waitFor, capture }) {
  await waitFor(
    () => js(main, `Boolean(document.querySelector('.workbench-header'))`),
    '主界面就绪'
  )
  const visible = () =>
    js(
      note,
      `Array.from(document.querySelectorAll('[data-note-jotting-id]')).map(row => row.textContent.trim())`
    )
  const mode = (kind) =>
    waitFor(
      () =>
        js(note, `document.querySelector('[data-testid=task-new]').dataset.newKind === '${kind}'`),
      `当前类别${kind}`
    )
  const settled = async () => {
    await waitFor(
      () =>
        js(
          note,
          `Math.abs(document.querySelector('[data-note-page][aria-hidden=false]').getBoundingClientRect().left - document.querySelector('.note-pages').getBoundingClientRect().left) < 0.5`
        ),
      '列表滑动落位'
    )
    await js(
      note,
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
    )
  }
  if (phase.endsWith('restart')) {
    assert.equal(
      await js(note, `document.querySelector('[data-testid=task-new]').dataset.newKind`),
      'task',
      '重启默认任务页'
    )
    await click(note, '[data-testid=new-kind-inspiration]')
    await waitFor(
      async () => (await visible()).some((text) => text.includes('便签小记验收')),
      '重启保留小记数据'
    )
    return
  }
  await js(note, `window.myTodo.createInspiration('便签小记验收')`)
  await js(
    note,
    `(async () => { const {settings} = (await window.myTodo.getWindowState()).data; await window.myTodo.updateSettings({...settings, appearance:'light', edgeAutoHide:false}) })()`
  )
  const before = note.getContentSize()
  const heading = await js(
    note,
    `(() => {
    const header = document.querySelector('.task-heading');
    const title = header.querySelector('h1');
    const date = header.querySelector('.task-date');
    const divider = document.querySelector('.note-page-divider').getBoundingClientRect();
    const panel = document.querySelector('.tasks-page.note').getBoundingClientRect();
    const pages = document.querySelector('.note-pages').getBoundingClientRect();
    return { title: title.textContent, date: date.textContent,
      sameLine: Math.abs(title.getBoundingClientRect().bottom - date.getBoundingClientRect().bottom) < 5,
      fullWidth: Math.abs(divider.left - panel.left - 1) < 1 && Math.abs(divider.right - panel.right + 1) < 1,
      gap: pages.top - divider.bottom };
  })()`
  )
  assert.equal(heading.title, '今天')
  assert.match(heading.date, /^\d+月\d+日 · 周[一二三四五六日]$/)
  assert.ok(heading.sameLine, '任务标题和日期同排')
  assert.ok(heading.fullWidth, '分隔线贯穿便签内容表面')
  assert.equal(heading.gap, 4, '列表紧接分隔线')
  await capture(note, 'note-header-task.png')
  await click(note, '[data-testid=new-kind-inspiration]')
  await waitFor(
    () => js(note, `document.querySelector('.task-heading h1')?.textContent === '小记'`),
    '类别切换显示小记页'
  )
  assert.equal((await visible()).length, 1, '显示今天的小记')
  assert.equal(
    await js(note, `document.querySelector('.task-heading .task-date').textContent`),
    '今天 · 1条'
  )
  assert.equal(
    await js(
      note,
      `getComputedStyle(document.querySelector('.note-jotting-marker'), '::before').borderRadius`
    ),
    '50%'
  )
  await js(main, `window.myTodo.createInspiration('最近一条小记')`)
  assert.equal(
    await js(
      note,
      `(() => {
    const marker = document.querySelector('.note-jotting-marker');
    const probe = document.createElement('span'); probe.style.color = 'var(--app-accent)'; marker.append(probe);
    const same = getComputedStyle(marker, '::before').backgroundColor === getComputedStyle(probe).color;
    probe.remove(); return same;
  })()`
    ),
    true,
    '小记圆点使用主题色'
  )
  await waitFor(async () => (await visible()).length === 2, '新增跨窗口同步')
  assert.equal((await visible())[0], '最近一条小记', '小记按记录时间倒序')
  assert.deepEqual(note.getContentSize(), before, '切页尺寸不变')
  await settled()
  const excluded = await js(
    main,
    `(async () => {
    const old = (await window.myTodo.createInspiration('昨天的小记')).data;
    const legacy = (await window.myTodo.createInspiration('无日期的小记')).data;
    const archived = (await window.myTodo.createInspiration('已归档的小记')).data;
    await window.myTodo.archiveInspiration(archived.id);
    return {old:old.id, legacy:legacy.id};
  })()`
  )
  const db = new DatabaseSync(resolve(process.env.MYTODO_SMOKE_DATA, 'mytodo.sqlite'))
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  db.prepare('UPDATE inspirations SET created_at = ? WHERE id = ?').run(
    yesterday.toISOString(),
    excluded.old
  )
  db.prepare('UPDATE inspirations SET created_at = NULL WHERE id = ?').run(excluded.legacy)
  await js(main, `window.myTodo.createInspiration('日期筛选后的小记')`)
  await waitFor(async () => (await visible()).length === 3, '只显示当天未归档的小记')
  assert.equal(
    await js(
      note,
      `document.querySelector('[data-note-page=inspiration]').querySelectorAll('input,textarea,[draggable=true]').length`
    ),
    0,
    '便签小记只读'
  )
  assert.equal(
    await js(
      note,
      `Array.from(document.querySelectorAll('[data-note-jotting-id] button')).every(x => x.title === '归档小记')`
    ),
    true,
    '只提供归档'
  )
  await click(note, '[data-note-jotting-id] button')
  await waitFor(async () => (await visible()).length === 2, '直接归档更新列表')
  assert.equal(
    (await js(main, `window.myTodo.listInspirations()`)).data.some(
      (x) => x.description === '日期筛选后的小记'
    ),
    false,
    '归档同步主界面读取结果'
  )
  const archiveCount = () =>
    js(
      note,
      `document.querySelector('[data-testid=jotting-archive-toggle] .note-group-count').textContent`
    )
  await waitFor(async () => (await archiveCount()) === '2', '小记归档数量同步')
  assert.equal(
    await js(
      note,
      `document.querySelector('[data-testid=jotting-archive-toggle]').getAttribute('aria-expanded')`
    ),
    'false',
    '已归档默认折叠'
  )
  await click(note, '[data-testid=jotting-archive-toggle]')
  const archivedRow = (text) => `[data-archived-jotting-id]:has([title="${text}"])`
  await click(note, `${archivedRow('日期筛选后的小记')} [title="恢复小记"]`)
  await waitFor(
    async () => (await visible()).length === 3 && (await archiveCount()) === '1',
    '当天小记恢复到列表'
  )
  await click(note, '[data-note-jotting-id] button')
  await waitFor(
    async () => (await visible()).length === 2 && (await archiveCount()) === '2',
    '再次归档保留展开状态'
  )
  await js(main, `window.myTodo.archiveInspiration('${excluded.old}')`)
  await js(main, `window.myTodo.archiveInspiration('${excluded.legacy}')`)
  const dateProbe = await js(
    main,
    `(async () => {
    const idea = (await window.myTodo.createInspiration('归档日期边界验收')).data;
    await window.myTodo.archiveInspiration(idea.id);
    return idea.id;
  })()`
  )
  await waitFor(async () => (await archiveCount()) === '3', '当天归档小记跨窗口同步')
  assert.equal(
    await js(
      note,
      `Array.from(document.querySelectorAll('[data-archived-jotting-id]')).some(x => /昨天的小记|无日期的小记/.test(x.textContent))`
    ),
    false,
    '已归档也仅显示今天记录的小记'
  )
  await js(main, `window.myTodo.deleteArchivedInspiration('${dateProbe}')`)
  await waitFor(async () => (await archiveCount()) === '2', '删除同步归档计数')
  const remove = `${archivedRow('已归档的小记')} [title="永久删除小记"]`
  await js(note, `document.querySelector(${JSON.stringify(remove)}).focus()`)
  await click(note, remove)
  await waitFor(
    () => js(note, `Boolean(document.querySelector('[role=alertdialog]'))`),
    '归档小记使用应用内删除确认'
  )
  await click(note, '[data-testid=delete-cancel]')
  assert.equal(await archiveCount(), '2', '取消删除保留小记')
  await click(note, remove)
  await click(note, '[data-testid=delete-confirm]')
  await waitFor(async () => (await archiveCount()) === '1', '确认永久删除小记')
  assert.equal(
    (await js(main, `window.myTodo.listInspirationPage(0,100,{kind:'archive'})`)).data.items.some(
      (x) => x.description === '已归档的小记'
    ),
    false,
    '删除同步另一窗口'
  )
  await capture(note, 'note-jottings-archived.png')
  await click(note, '[data-testid=jotting-archive-toggle]')
  await js(
    main,
    `(async () => { for(let i=0;i<18;i++) { await window.myTodo.createInspiration('长列表小记'+i); await window.myTodo.createTask('长列表任务'+i) } })()`
  )
  await waitFor(async () => (await visible()).length === 20, '长列表同步')
  const fixed = () =>
    js(
      note,
      `['.note-controls','.note-task-summary','.note-inspiration-summary'].map(s => { const e=document.querySelector(s); return [e.offsetLeft,e.offsetTop,e.offsetWidth,e.offsetHeight] })`
    )
  const fixedBefore = await fixed()
  await js(note, `document.querySelector('.note-jottings-list').scrollTop = 420`)
  const jotScroll = await js(note, `document.querySelector('.note-jottings-list').scrollTop`)
  assert.ok(jotScroll > 0, '小记独立滚动')
  await click(note, '[data-testid=new-kind-task]')
  await mode('task')
  await settled()
  await js(note, `document.querySelector('.task-list').scrollTop = 280`)
  const taskScroll = await js(note, `document.querySelector('.task-list').scrollTop`)
  assert.ok(taskScroll > 0, '任务独立滚动')
  const motion = async (target) =>
    js(
      note,
      `(async () => {
    const pane = document.querySelector('[data-note-page=task]');
    const start = pane.getBoundingClientRect().left;
    document.querySelector('[data-testid=new-kind-${target}]').click();
    const divider = document.querySelector('.note-page-divider-track');
    const dividerStart = divider.getBoundingClientRect().left;
    const positions=[], dividerPositions=[];
    for(let i=0;i<8;i++) {
      await new Promise(requestAnimationFrame);
      positions.push(pane.getBoundingClientRect().left);
      dividerPositions.push(divider.getBoundingClientRect().left);
    }
    return {start, positions, dividerStart, dividerPositions};
  })()`
    )
  const left = await motion('inspiration')
  assert.ok(
    left.positions.some((x) => x < left.start - 1),
    '切到小记时任务向左移动'
  )
  assert.ok(
    left.dividerPositions.some((x) => x < left.dividerStart - 1),
    '黄色分隔线从右向左进入'
  )
  await mode('inspiration')
  await settled()
  assert.equal(
    await js(note, `document.querySelector('.note-jottings-list').scrollTop`),
    jotScroll,
    '小记恢复滚动位置'
  )
  assert.deepEqual(await fixed(), fixedBefore, '滑动不移动工具和圆环')
  const right = await motion('task')
  assert.ok(
    right.positions.some((x) => x > right.start + 1),
    '返回任务时整体向右移动'
  )
  assert.ok(
    right.dividerPositions.some((x) => x > right.dividerStart + 1),
    '主题色分隔线从左向右恢复'
  )
  await mode('task')
  await settled()
  assert.equal(
    await js(note, `document.querySelector('.task-list').scrollTop`),
    taskScroll,
    '任务恢复滚动位置'
  )
  await js(
    note,
    `document.querySelector('[data-testid=new-kind-inspiration]').click(); document.querySelector('[data-testid=new-kind-task]').click()`
  )
  await mode('task')
  await settled()
  await click(note, '[data-testid=new-kind-inspiration]')
  await mode('inspiration')
  await settled()
  await input(note, '[data-testid=task-new]', '保存失败的小记', null)
  db.exec(
    "CREATE TRIGGER fail_jotting BEFORE INSERT ON inspirations WHEN NEW.description = '保存失败的小记' BEGIN SELECT RAISE(ABORT, '小记保存失败验收'); END"
  )
  await click(note, '[data-testid=new-kind-task]')
  await waitFor(
    () =>
      js(note, `document.querySelector('[role=alert]')?.textContent.includes('小记保存失败验收')`),
    '保存失败可见反馈'
  )
  await mode('inspiration')
  assert.equal(
    await js(note, `document.querySelector('[data-testid=task-new]').value`),
    '保存失败的小记',
    '失败保留草稿'
  )
  db.exec('DROP TRIGGER fail_jotting')
  await input(note, '[data-testid=task-new]', '保存失败的小记')
  await waitFor(
    () => js(note, `document.querySelector('[data-testid=task-new]').value === ''`),
    '重试成功'
  )
  await js(
    note,
    `document.querySelector('[data-testid=task-new]').dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}))`
  )
  await click(note, '[data-testid=new-kind-task]')
  await mode('inspiration')
  await js(
    note,
    `document.querySelector('[data-testid=task-new]').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}))`
  )
  await click(note, '[data-testid=new-kind-task]')
  await mode('task')
  await settled()
  await click(note, '[data-testid=new-kind-inspiration]')
  await mode('inspiration')
  await settled()
  await js(note, `document.querySelector('[data-testid=task-new]').blur()`)
  await js(note, 'window.myTodo.hideWindow()')
  await waitFor(() => !note.isVisible(), '隐藏便签')
  await js(main, `window.myTodo.openWindow('note')`)
  await waitFor(() => note.isVisible(), '唤出便签')
  await mode('inspiration')
  await settled()
  await capture(note, 'note-jottings-light.png')
  await js(
    note,
    `(async () => { const {settings} = (await window.myTodo.getWindowState()).data; await window.myTodo.updateSettings({...settings, appearance:'dark'}) })()`
  )
  await waitFor(() => js(note, `document.documentElement.dataset.theme === 'dark'`), '深色小记')
  await settled()
  await capture(note, 'note-jottings-dark.png')
  // 时钟是已有系统边界；只改时间来源，跨日广播、查询和SQLite仍走真实应用。
  const RealDate = Date
  try {
    globalThis.Date = class extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [RealDate.now() + 86400000]))
      }
    }
    await js(
      note,
      `window.smokeRealDate = Date; window.Date = class extends window.smokeRealDate { constructor(...args) { super(...(args.length ? args : [window.smokeRealDate.now()+86400000])) } }; void 0`
    )
    await waitFor(async () => (await visible()).length === 0, '跨日清空昨天的小记')
    await waitFor(async () => (await archiveCount()) === '0', '跨日清空昨天的归档小记')
    await js(main, `window.myTodo.createInspiration('新一天的小记')`)
    await waitFor(async () => (await visible()).length === 1, '跨日继续记录')
    assert.equal((await visible())[0], '新一天的小记')
  } finally {
    globalThis.Date = RealDate
    await js(note, 'window.Date = window.smokeRealDate; void 0')
    db.close()
  }
}

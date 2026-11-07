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
  const selectKind = async (kind) => {
    const current = await js(
      note,
      `document.querySelector('[data-testid=task-new]').dataset.newKind`
    )
    if (current !== kind) await click(note, '[data-testid=note-kind-toggle]')
  }
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
    await selectKind('inspiration')
    await waitFor(
      async () => (await visible()).some((text) => text.includes('便签小记验收')),
      '重启保留小记数据'
    )
    return
  }
  await waitFor(
    () => js(note, `Boolean(document.querySelector('[data-note-empty=task]'))`),
    '任务空页面'
  )
  await capture(note, 'note-empty-task.png')
  const expansion = await js(
    note,
    `(async () => {
    const controls = document.querySelector('.note-add-controls');
    const sample = () => ({ time: performance.now(), width: controls.getBoundingClientRect().width,
      left: controls.getBoundingClientRect().left, transition: getComputedStyle(controls).transition });
    const before = sample();
    document.querySelector('.note-add-button').click();
    const frames = [];
    while (performance.now() - before.time < 1400) {
      await new Promise(requestAnimationFrame);
      frames.push(sample());
    }
    document.querySelector('.note-add-button').click();
    await new Promise(resolve => setTimeout(resolve, 1400));
    return { reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      before, early: frames.find(frame => frame.time - before.time > 300),
      middle: frames.find(frame => frame.time - before.time > 350), last: frames.at(-1) };
  })()`
  )
  assert.ok(expansion.middle.width < expansion.last.width - 10, '输入框350毫秒时仍在延长')
  assert.ok(expansion.middle.width > expansion.before.width + 10, '输入框宽度逐渐增加')
  assert.ok(Math.abs(expansion.last.left - expansion.before.left) < 1, '输入框左边保持固定')
  await click(note, '[data-note-empty=task] button')
  await waitFor(
    () => js(note, `document.activeElement === document.querySelector('[data-testid=task-new]')`),
    '空任务页面进入新增'
  )
  await js(
    note,
    `document.querySelector('.note-empty').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0 }))`
  )
  assert.equal(
    await js(note, `document.querySelector('.note-add-button').getAttribute('aria-expanded')`),
    'false',
    '空输入点击外部空白收起'
  )
  await click(note, '.note-add-button')
  await input(note, '[data-testid=task-new]', '保留未提交草稿', null)
  await js(
    note,
    `document.querySelector('.note-empty').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0 }))`
  )
  assert.equal(
    await js(note, `document.querySelector('.note-add-button').getAttribute('aria-expanded')`),
    'true',
    '有草稿时点击外部保持展开'
  )
  await input(note, '[data-testid=task-new]', '', null)
  await selectKind('inspiration')
  await settled()
  await waitFor(
    () => js(note, `Boolean(document.querySelector('[data-note-empty=inspiration]'))`),
    '小记空页面'
  )
  await js(note, `document.querySelector('[data-testid=task-new]').blur()`)
  await capture(note, 'note-empty-jotting.png')
  await click(note, '[data-note-empty=inspiration] button')
  await waitFor(
    () => js(note, `document.activeElement === document.querySelector('[data-testid=task-new]')`),
    '空小记页面进入新增'
  )
  await selectKind('task')
  await settled()
  await js(note, `window.dook.createInspiration('便签小记验收')`)
  await js(
    note,
    `(async () => { const {settings} = (await window.dook.getWindowState()).data; await window.dook.updateSettings({...settings, appearance:'light', edgeAutoHide:false}) })()`
  )
  const before = note.getContentSize()
  const heading = await js(
    note,
    `(() => {
    const header = document.querySelector('.task-heading');
    const title = header.querySelector('.note-heading-label[aria-hidden=false] h1');
    const date = header.querySelector('.note-heading-label[aria-hidden=false] .task-date');
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
  await selectKind('inspiration')
  await waitFor(
    () =>
      js(
        note,
        `document.querySelector('.note-heading-label[aria-hidden=false] h1')?.textContent === '小记'`
      ),
    '类别切换显示小记页'
  )
  assert.equal((await visible()).length, 1, '显示今天的小记')
  assert.equal(
    await js(
      note,
      `document.querySelector('.note-heading-label[aria-hidden=false] .task-date').textContent`
    ),
    '今天 · 1条'
  )
  assert.equal(
    await js(
      note,
      `getComputedStyle(document.querySelector('.note-jotting-marker'), '::before').borderRadius`
    ),
    '50%'
  )
  await js(main, `window.dook.createInspiration('最近一条小记')`)
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
  await click(note, '[data-note-jotting-id] .task-description')
  assert.equal(
    await js(note, `Boolean(document.querySelector('[data-testid=jotting-edit]'))`),
    true,
    '点击便签小记正文可原地编辑'
  )
  await input(note, '[data-testid=jotting-edit]', '便签编辑后的小记')
  await waitFor(async () => (await visible())[0] === '便签编辑后的小记', '便签小记编辑保存')
  assert.equal(
    (await js(main, `window.dook.listInspirations()`)).data.some(
      (idea) => idea.description === '便签编辑后的小记'
    ),
    true,
    '便签编辑同步到主界面数据'
  )
  const excluded = await js(
    main,
    `(async () => {
    const old = (await window.dook.createInspiration('昨天的小记')).data;
    const legacy = (await window.dook.createInspiration('无日期的小记')).data;
    const archived = (await window.dook.createInspiration('已归档的小记')).data;
    await window.dook.archiveInspiration(archived.id);
    return {old:old.id, legacy:legacy.id};
  })()`
  )
  const db = new DatabaseSync(resolve(process.env.DOOK_SMOKE_DATA, 'dook.sqlite'))
  const archiveProbe = await js(
    main,
    `(async () => {
    const old = (await window.dook.createTask('昨天归档的任务')).data;
    await window.dook.archiveTask(old.id);
    const current = (await window.dook.createTask('今天归档的任务')).data;
    await window.dook.convertToMultiDay(current.id);
    await window.dook.archiveTask(current.id);
    return {old: old.id, current: current.id};
  })()`
  )
  const previousDay = new Date()
  previousDay.setDate(previousDay.getDate() - 1)
  db.prepare('UPDATE tasks SET archived_at = ? WHERE id = ?').run(
    previousDay.toISOString(),
    archiveProbe.old
  )
  db.prepare('UPDATE tasks SET date = ? WHERE id = ?').run('2020-01-01', archiveProbe.current)
  await js(main, `window.dook.createTask('触发归档日期刷新')`)
  await waitFor(
    () =>
      js(
        note,
        `document.querySelectorAll('[data-archived-task-id]').length === 1 && Boolean(document.querySelector('[data-archived-task-id="${archiveProbe.current}"]'))`
      ),
    '便签仅显示今天归档的任务，按归档时间包含旧多天任务'
  )
  assert.equal(
    (await js(main, `window.dook.listArchivedTasks()`)).data.length,
    2,
    '主界面保留历史归档'
  )
  await click(note, '[data-note-jotting-id] .task-description')
  db.exec(
    "CREATE TRIGGER fail_jotting_edit BEFORE UPDATE ON inspirations WHEN NEW.description = '编辑失败保留草稿' BEGIN SELECT RAISE(ABORT, '小记编辑失败验收'); END"
  )
  await input(note, '[data-testid=jotting-edit]', '编辑失败保留草稿')
  await selectKind('task')
  await mode('inspiration')
  assert.equal(
    await js(note, `document.querySelector('[data-testid=jotting-edit]').value`),
    '编辑失败保留草稿',
    '编辑保存失败保留草稿并阻止切页'
  )
  db.exec('DROP TRIGGER fail_jotting_edit')
  await input(note, '[data-testid=jotting-edit]', '编辑重试成功', null)
  await js(note, `document.querySelector('[data-testid=jotting-edit]').blur()`)
  await waitFor(async () => (await visible())[0] === '编辑重试成功', '编辑失焦保存可重试')
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  db.prepare('UPDATE inspirations SET created_at = ? WHERE id = ?').run(
    yesterday.toISOString(),
    excluded.old
  )
  db.prepare('UPDATE inspirations SET created_at = NULL WHERE id = ?').run(excluded.legacy)
  await js(main, `window.dook.createInspiration('日期筛选后的小记')`)
  await waitFor(async () => (await visible()).length === 3, '只显示当天未归档的小记')
  assert.equal(
    await js(
      note,
      `document.querySelector('[data-note-page=inspiration]').querySelectorAll('input,textarea,[draggable=true]').length`
    ),
    0,
    '未编辑时保持紧凑正文'
  )
  assert.equal(
    await js(
      note,
      `Array.from(document.querySelectorAll('[data-note-jotting-id] .note-task-actions button')).every(x => x.title === '归档小记')`
    ),
    true,
    '只提供归档'
  )
  await click(note, '[data-note-jotting-id] [title="归档小记"]')
  await waitFor(async () => (await visible()).length === 2, '直接归档更新列表')
  assert.equal(
    (await js(main, `window.dook.listInspirations()`)).data.some(
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
  await click(note, '[data-note-jotting-id] [title="归档小记"]')
  await waitFor(
    async () => (await visible()).length === 2 && (await archiveCount()) === '2',
    '再次归档保留展开状态'
  )
  await js(main, `window.dook.archiveInspiration('${excluded.old}')`)
  await js(main, `window.dook.archiveInspiration('${excluded.legacy}')`)
  db.prepare('UPDATE inspirations SET archived_at = ? WHERE id = ?').run(
    previousDay.toISOString(),
    excluded.old
  )
  const dateProbe = await js(
    main,
    `(async () => {
    const idea = (await window.dook.createInspiration('归档日期边界验收')).data;
    await window.dook.archiveInspiration(idea.id);
    return idea.id;
  })()`
  )
  await waitFor(
    async () =>
      (await archiveCount()) === '4' &&
      (await js(
        note,
        `Boolean(document.querySelector('[data-archived-jotting-id="${dateProbe}"]'))`
      )),
    '当天归档小记跨窗口同步'
  )
  assert.deepEqual(
    await js(
      note,
      `Array.from(document.querySelectorAll('[data-archived-jotting-id]')).map(x => x.dataset.archivedJottingId).filter(id => ${JSON.stringify([excluded.old, excluded.legacy])}.includes(id))`
    ),
    [excluded.legacy],
    '按归档日期筛选，包含今天归档的无创建日期小记'
  )
  await js(main, `window.dook.deleteArchivedInspiration('${dateProbe}')`)
  await waitFor(async () => (await archiveCount()) === '3', '删除同步归档计数')
  const remove = `${archivedRow('已归档的小记')} [title="永久删除小记"]`
  await js(note, `document.querySelector(${JSON.stringify(remove)}).focus()`)
  await click(note, remove)
  await waitFor(
    () => js(note, `Boolean(document.querySelector('[role=alertdialog]'))`),
    '归档小记使用应用内删除确认'
  )
  await click(note, '[data-testid=delete-cancel]')
  assert.equal(await archiveCount(), '3', '取消删除保留小记')
  await click(note, remove)
  await click(note, '[data-testid=delete-confirm]')
  await waitFor(async () => (await archiveCount()) === '2', '确认永久删除小记')
  assert.equal(
    (await js(main, `window.dook.listInspirationPage(0,100,{kind:'archive'})`)).data.items.some(
      (x) => x.description === '已归档的小记'
    ),
    false,
    '删除同步另一窗口'
  )
  await capture(note, 'note-jottings-archived.png')
  await click(note, '[data-testid=jotting-archive-toggle]')
  await js(
    main,
    `(async () => { for(let i=0;i<18;i++) { await window.dook.createInspiration('长列表小记'+i); await window.dook.createTask('长列表任务'+i) } })()`
  )
  await waitFor(async () => (await visible()).length === 20, '长列表同步')
  await selectKind('task')
  await mode('task')
  await settled()
  await click(note, '.task-check')
  for (const window of [note, main]) {
    await waitFor(
      () => js(window, `Boolean(document.querySelector('.task-check:checked'))`),
      '任务完成状态同步'
    )
    assert.equal(
      await js(
        window,
        `getComputedStyle(document.querySelector('.task-check:checked'), '::before').content`
      ),
      '"OK"',
      '两窗口任务checkbox显示OK'
    )
  }
  await selectKind('inspiration')
  await mode('inspiration')
  await settled()
  const fixed = () =>
    js(
      note,
      `['.note-controls','.note-task-summary','.note-inspiration-summary'].map(s => { const e=document.querySelector(s); return [e.offsetLeft,e.offsetTop,e.offsetWidth,e.offsetHeight] })`
    )
  const fixedBefore = await fixed()
  await js(note, `document.querySelector('.note-jottings-list').scrollTop = 420`)
  const jotScroll = await js(note, `document.querySelector('.note-jottings-list').scrollTop`)
  assert.ok(jotScroll > 0, '小记独立滚动')
  await selectKind('task')
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
    document.querySelector('[data-testid=note-kind-toggle]').click();
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
    '分隔线向左切换'
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
    '分隔线向右恢复'
  )
  await mode('task')
  await settled()
  assert.equal(
    await js(note, `document.querySelector('.task-list').scrollTop`),
    taskScroll,
    '任务恢复滚动位置'
  )
  await selectKind('inspiration')
  await mode('inspiration')
  await selectKind('task')
  await mode('task')
  await settled()
  await selectKind('inspiration')
  await mode('inspiration')
  await settled()
  await input(note, '[data-testid=task-new]', '保存失败的小记', null)
  db.exec(
    "CREATE TRIGGER fail_jotting BEFORE INSERT ON inspirations WHEN NEW.description = '保存失败的小记' BEGIN SELECT RAISE(ABORT, '小记保存失败验收'); END"
  )
  await selectKind('task')
  await mode('task')
  await selectKind('inspiration')
  await mode('inspiration')
  assert.equal(
    await js(note, `document.querySelector('[data-testid=task-new]').value`),
    '保存失败的小记',
    '切换类别保留未提交草稿'
  )
  await click(note, '.note-add-button')
  assert.equal(
    await js(note, `document.querySelector('.note-add-button').getAttribute('aria-expanded')`),
    'false',
    '叉号收起输入框'
  )
  assert.equal(
    db
      .prepare("SELECT COUNT(*) AS count FROM inspirations WHERE description = '保存失败的小记'")
      .get().count,
    0,
    '切页和收起均不自动新增'
  )
  await click(note, '.note-add-button')
  assert.equal(
    await js(note, `document.querySelector('[data-testid=task-new]').value`),
    '保存失败的小记',
    '展开恢复草稿'
  )
  await input(note, '[data-testid=task-new]', '保存失败的小记')
  await waitFor(
    () =>
      js(
        note,
        `document.querySelector('[role=alert], [data-sonner-toast][data-type=error] [data-title]')?.textContent.includes('小记保存失败验收')`
      ),
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
  await selectKind('task')
  await mode('inspiration')
  await js(
    note,
    `document.querySelector('[data-testid=task-new]').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}))`
  )
  await selectKind('task')
  await mode('task')
  await settled()
  await selectKind('inspiration')
  await mode('inspiration')
  await settled()
  await js(note, `document.querySelector('[data-testid=task-new]').blur()`)
  await js(note, 'window.dook.hideWindow()')
  await waitFor(() => !note.isVisible(), '隐藏便签')
  await js(main, `window.dook.openWindow('note')`)
  await waitFor(() => note.isVisible(), '唤出便签')
  await mode('inspiration')
  await settled()
  await capture(note, 'note-jottings-light.png')
  await js(
    note,
    `(async () => { const {settings} = (await window.dook.getWindowState()).data; await window.dook.updateSettings({...settings, appearance:'dark'}) })()`
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
    await js(main, `window.dook.createInspiration('新一天的小记')`)
    await waitFor(async () => (await visible()).length === 1, '跨日继续记录')
    assert.equal((await visible())[0], '新一天的小记')
  } finally {
    globalThis.Date = RealDate
    await js(note, 'window.Date = window.smokeRealDate; void 0')
    db.close()
  }
}

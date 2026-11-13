import assert from 'node:assert/strict'
import { mkdirSync, rmdirSync } from 'node:fs'
import { join } from 'node:path'

export async function aiScenePromptsSmoke({ main, note, phase, js, click, input, waitFor }) {
  const cards = '.ai-prompt-cards'
  const toggle = (mode) => `[aria-label="${mode === 'default' ? '默认' : '自定义'}提示词"]`
  const field = '.ai-prompt-dialog textarea'
  const save = '.ai-prompt-dialog [type="submit"]'
  const daily = '.ai-prompt-card-actions [aria-label="编辑日报提示词"]'
  const editDaily = '.ai-prompt-card-view[aria-label="编辑日报提示词"]'
  const viewDaily = '[aria-label="查看日报提示词"]'
  const restoreDaily = '[aria-label="恢复日报默认提示词"]'
  const dailyStatus = () =>
    js(
      main,
      `document.querySelector('${cards} li:first-child .ai-prompt-card-status')?.textContent`
    )
  const settings = async () => {
    const result = await js(main, 'window.dook.getAiScenePrompts()')
    assert.equal(result.ok, true)
    return result.data
  }
  const waitMode = (mode) =>
    waitFor(
      () =>
        js(
          main,
          `document.querySelector('${toggle(mode)}')?.getAttribute('aria-checked') === 'true'`
        ),
      `提示词模式为${mode}`
    )
  const closed = () =>
    waitFor(() => js(main, `!document.querySelector('${field}')`), '提示词弹窗已关闭')
  const promptValue = () => js(main, `document.querySelector('${field}')?.value`)
  const press = (keyCode) => {
    main.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    main.webContents.sendInputEvent({ type: 'keyUp', keyCode })
  }
  const savePrompt = async (selector, content) => {
    await click(main, selector)
    await input(main, field, content, null)
    await click(main, save)
    await closed()
  }
  await click(note, '[data-testid=note-settings]')
  if (phase.endsWith('restart')) {
    await waitMode('custom')
    await click(main, daily)
    assert.equal(await promptValue(), '日报每项只写一句。')
    return
  }

  await waitMode('default')
  const originalBounds = main.getBounds()
  const [minimumWidth] = main.getMinimumSize()
  main.setSize(minimumWidth, originalBounds.height)
  try {
    await waitFor(() => js(main, `window.innerWidth <= ${minimumWidth}`), '主窗口缩至最小宽度')
    assert.equal(
      await js(
        main,
        `(() => {
        const list = document.querySelector('${cards}');
        const rows = Array.from(list.children, card => card.getBoundingClientRect().top);
        return rows.length === 5 && new Set(rows).size === 1 && list.scrollWidth <= list.clientWidth;
      })()`
      ),
      true,
      '五张卡片在最小窗口宽度下保持单行'
    )
  } finally {
    main.setBounds(originalBounds)
  }
  assert.deepEqual(
    await js(
      main,
      `Array.from(document.querySelectorAll('${cards} li strong'), name => name.textContent)`
    ),
    ['日报', '周报', '月报', '小记归集', '每日提示']
  )
  assert.equal(await dailyStatus(), 'default')
  assert.equal(
    await js(
      main,
      `Array.from(document.querySelectorAll('${cards} .ai-prompt-card-label')).every(label => {
      const icon = label.querySelector('svg').getBoundingClientRect();
      const text = label.querySelector('strong').getBoundingClientRect();
      return Math.abs((icon.top + icon.bottom) / 2 - (text.top + text.bottom) / 2) < 1;
    })`
    ),
    true,
    '所有场景卡片的图标与标题垂直居中对齐'
  )
  assert.equal(
    await js(main, `getComputedStyle(document.querySelector('${viewDaily}')).borderTopWidth`),
    '0px',
    '卡片点击区域不显示原生按钮边框'
  )
  assert.equal(await js(main, `Boolean(document.querySelector('${daily}'))`), false)
  await click(main, viewDaily)
  assert.equal(
    await js(main, 'document.querySelector(".ai-prompt-dialog h2").textContent'),
    '日报提示词（只读）'
  )
  assert.match(await promptValue(), /虚构示例/)
  assert.equal(await js(main, `document.querySelector('${field}').readOnly`), true)
  assert.equal(await js(main, `Boolean(document.querySelector('${save}'))`), false)
  await waitFor(
    () =>
      js(
        main,
        `document.activeElement.matches('.ai-prompt-dialog button') &&
      document.activeElement.textContent.trim() === '关闭'`
      ),
    '只读弹窗打开时聚焦关闭按钮'
  )
  assert.equal(
    await js(main, 'Boolean(document.querySelector(".ai-prompt-dialog .ai-dialog-description"))'),
    false
  )
  press('Escape')
  await closed()
  await js(main, `document.querySelector('${toggle('default')}').focus()`)
  press('Right')
  await waitFor(
    () => js(main, `document.activeElement.matches('${toggle('custom')}')`),
    '键盘可聚焦自定义模式'
  )
  press('Space')
  await waitMode('custom')
  assert.equal(await js(main, `Boolean(document.querySelector('${restoreDaily}'))`), false)

  await click(main, daily)
  assert.match(await promptValue(), /虚构示例/)
  await input(main, field, '本次放弃的草稿', null)
  press('Escape')
  await closed()
  assert.equal((await settings()).scenes[0].customPrompt, null)

  await click(main, daily)
  await input(main, field, '  ', null)
  assert.equal(await js(main, `document.querySelector('${save}').disabled`), true)
  assert.match(await js(main, 'document.querySelector(".ai-prompt-error").textContent'), /恢复默认/)
  await input(main, field, '日报每项只写一句。', null)
  const temporary = join(process.env.DOOK_SMOKE_DATA, 'ai-scene-prompts', 'daily_report.md.tmp')
  mkdirSync(temporary, { recursive: true })
  try {
    await click(main, save)
    await waitFor(
      () =>
        js(main, 'document.querySelector(".ai-prompt-error")?.textContent.includes("无法保存")'),
      '保存失败显示错误'
    )
    assert.equal(await promptValue(), '日报每项只写一句。')
    assert.equal((await settings()).scenes[0].customPrompt, null)
  } finally {
    rmdirSync(temporary)
  }
  await click(main, save)
  await closed()
  assert.equal(await dailyStatus(), '自定义')
  await click(main, editDaily)
  assert.equal(await promptValue(), '日报每项只写一句。')
  const promptPath = join(process.env.DOOK_SMOKE_DATA, 'ai-scene-prompts', 'daily_report.md')
  assert.deepEqual(
    await js(
      main,
      `(() => {
      const location = document.querySelector('.ai-prompt-file-location');
      return [location?.textContent, location?.title];
    })()`
    ),
    [promptPath, promptPath]
  )
  assert.equal(await js(main, `document.querySelector('${field}').readOnly`), false)
  assert.equal(await js(main, `Boolean(document.querySelector('${save}'))`), true)
  press('Escape')
  await closed()
  for (const name of ['周报', '月报', '小记归集', '每日提示']) {
    await click(main, `.ai-prompt-card-view[aria-label="${name}"]`)
    assert.equal(
      await js(
        main,
        `Boolean(document.querySelector('.ai-prompt-card-view[aria-label="${name}"] + .ai-prompt-card-actions'))`
      ),
      false
    )
    assert.equal(await promptValue(), undefined)
  }
  await waitFor(
    () =>
      js(
        main,
        `Array.from(document.querySelectorAll('[data-sonner-toast]')).some(toast => toast.textContent.includes('努力开发中'))`
      ),
    '未开放的场景显示开发中提示'
  )
  assert.equal(
    (await js(main, `window.dook.saveAiScenePrompt('weekly_report', '每个项目单独写。')`)).ok,
    true
  )
  await click(main, daily)
  const viewDefault = '.ai-prompt-dialog-heading button'
  await click(main, viewDefault)
  assert.equal(await js(main, `document.querySelector('${field}').readOnly`), true)
  assert.match(await promptValue(), /今日完成/)
  await click(main, viewDefault)
  assert.equal(await promptValue(), '日报每项只写一句。')
  press('Escape')
  await closed()

  await click(main, toggle('default'))
  await waitMode('default')
  assert.equal(await dailyStatus(), 'default')
  assert.equal(await js(main, `Boolean(document.querySelector('${restoreDaily}'))`), false)
  await click(main, toggle('custom'))
  await waitMode('custom')
  assert.equal(await dailyStatus(), '自定义')

  await click(main, restoreDaily)
  await click(main, '[data-testid="delete-cancel"]')
  assert.equal((await settings()).scenes[0].customPrompt, '日报每项只写一句。')
  await click(main, restoreDaily)
  await click(main, '[data-testid="delete-confirm"]')
  await waitFor(async () => (await settings()).scenes[0].customPrompt === null, '仅恢复日报提示词')
  assert.equal((await settings()).scenes[1].customPrompt, '每个项目单独写。')
  await waitFor(
    () => js(main, `document.activeElement.matches('${toggle('custom')}')`),
    '确认恢复后回到提示词设置'
  )
  assert.equal(
    await js(main, `document.querySelector('${cards}').textContent.includes('全部恢复默认')`),
    false
  )
  await waitMode('custom')
  await savePrompt(daily, '日报每项只写一句。')
}

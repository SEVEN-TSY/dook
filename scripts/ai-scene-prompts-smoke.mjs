import assert from 'node:assert/strict'
import { mkdirSync, rmdirSync } from 'node:fs'
import { join } from 'node:path'

export async function aiScenePromptsSmoke({ main, note, phase, js, click, input, waitFor }) {
  const table = '#ai-scene-prompt-table'
  const toggle = (mode) => `[aria-label="${mode === 'default' ? '默认' : '自定义'}提示词"]`
  const field = '.ai-prompt-dialog textarea'
  const save = '.ai-prompt-dialog [type="submit"]'
  const daily = '[aria-label="查看与编辑日报提示词"]'
  const weekly = '[aria-label="查看与编辑周报提示词"]'
  const restoreDaily = '[aria-label="恢复日报默认提示词"]'
  const restoreAll = '.ai-prompt-toolbar button'
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
  assert.equal(await js(main, `document.querySelector('${table}').hidden`), true)
  await js(main, `document.querySelector('${toggle('default')}').focus()`)
  press('Right')
  await waitFor(
    () => js(main, `document.activeElement.matches('${toggle('custom')}')`),
    '键盘可聚焦自定义模式'
  )
  press('Space')
  await waitMode('custom')
  assert.deepEqual(
    await js(
      main,
      `Array.from(document.querySelectorAll('${table} tbody tr'), row => row.cells[0].textContent)`
    ),
    ['日报', '周报', '月报']
  )
  assert.equal(await js(main, `document.querySelector('${restoreAll}').disabled`), true)

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
  const temporary = join(process.env.DOOK_SMOKE_DATA, 'ai-scene-prompts.json.tmp')
  mkdirSync(temporary)
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
  await savePrompt(weekly, '每个项目单独写。')
  await click(main, daily)
  const viewDefault = '.ai-prompt-field-heading button'
  await click(main, viewDefault)
  assert.equal(await js(main, `document.querySelector('${field}').readOnly`), true)
  assert.match(await promptValue(), /今日完成/)
  await click(main, viewDefault)
  assert.equal(await promptValue(), '日报每项只写一句。')
  press('Escape')
  await closed()

  await click(main, toggle('default'))
  await waitMode('default')
  assert.equal(await js(main, `document.querySelector('${table}').hidden`), true)
  await click(main, toggle('custom'))
  await waitMode('custom')

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
  await click(main, restoreAll)
  await click(main, '[data-testid="delete-confirm"]')
  await waitFor(
    async () => (await settings()).scenes.every(({ customPrompt }) => customPrompt === null),
    '恢复所有提示词'
  )
  await waitMode('custom')
  await savePrompt(daily, '日报每项只写一句。')
}

import assert from 'node:assert/strict'
import { nativeTheme, screen, systemPreferences } from 'electron'

export async function appearanceSmoke({ main, note, phase, js, click, waitFor, capture }) {
  const state = async () => (await js(note, 'window.dook.getWindowState()')).data
  const theme = (window) => js(window, `document.documentElement.dataset.theme`)
  await waitFor(
    () => js(main, `Boolean(document.querySelector('.workbench-header'))`),
    '主界面就绪'
  )
  if (phase.endsWith('restart')) {
    assert.equal((await state()).settings.appearance, 'dark', '重启保留深色选择')
    await waitFor(
      async () => (await theme(note)) === 'dark' && (await theme(main)) === 'dark',
      '重启双窗口深色'
    )
    assert.equal((await state()).settings.themeColor, '#257c68', '重启保留主题色')
    return
  }
  assert.equal((await state()).settings.appearance, 'system', '旧配置及首次使用默认随系统')
  assert.equal((await state()).settings.themeColor, 'system', '首次使用默认系统主题色')
  await click(note, '[data-testid=note-settings]')
  assert.equal(
    await js(main, `document.querySelector('[aria-label="系统色主题"]').getAttribute('aria-pressed')`),
    'true',
    '设置页默认选中系统色'
  )
  if (process.platform === 'win32') {
    const accent = (window) =>
      js(window, `document.documentElement.style.getPropertyValue('--app-accent')`)
    systemPreferences.emit('accent-color-changed', {}, '467AB9FF')
    await waitFor(
      async () => (await accent(main)) === '#467ab9' && (await accent(note)) === '#467ab9',
      'Windows强调色变化同步到主界面和便签'
    )
    await click(main, '[aria-label="雾蓝主题"]')
    await waitFor(async () => (await accent(note)) === '#526fc4', '切换到固定主题色')
    systemPreferences.emit('accent-color-changed', {}, '6B523DFF')
    await waitFor(async () => (await state()).systemAccentColor === '#6b523d', '更新系统色预览')
    assert.equal(await accent(note), '#526fc4', '固定主题色独立于系统色')
    await click(main, '[aria-label="系统色主题"]')
    await waitFor(async () => (await accent(note)) === '#6b523d', '重新选择时使用最新系统色')
    systemPreferences.emit('accent-color-changed', {}, systemPreferences.getAccentColor())
  }
  assert.equal(await js(main, `document.querySelector('[data-slot="toggle-group"] [value="system"]')?.getAttribute('aria-checked') ?? document.querySelector('[aria-label="随系统外观"]').getAttribute('aria-checked')`), 'true', 'shadcn单选组默认随系统')
  await click(main, '[aria-label="深色外观"]')
  await waitFor(
    async () => (await theme(main)) === 'dark' && (await theme(note)) === 'dark',
    '深色跨窗口同步'
  )
  const original = Object.getOwnPropertyDescriptor(nativeTheme, 'shouldUseDarkColors')
  let systemDark = false
  Object.defineProperty(nativeTheme, 'shouldUseDarkColors', {
    configurable: true,
    get: () =>
      nativeTheme.themeSource === 'system' ? systemDark : nativeTheme.themeSource === 'dark'
  })
  try {
    nativeTheme.emit('updated')
    assert.equal((await state()).colorScheme, 'dark', '固定深色不受系统浅色影响')
    await click(main, '[aria-label="随系统外观"]')
    await waitFor(async () => (await theme(note)) === 'light', '随系统切换浅色')
    systemDark = true
    nativeTheme.emit('updated')
    await waitFor(
      async () => (await theme(main)) === 'dark' && (await theme(note)) === 'dark',
      '跟随系统变化'
    )
    await click(main, '[aria-label="浅色外观"]')
    nativeTheme.emit('updated')
    await waitFor(async () => (await theme(note)) === 'light', '固定浅色不受系统深色影响')
    await capture(main, 'appearance-light-settings.png')
    await click(main, '[aria-label="深色外观"]')
    await js(
      note,
      `(async () => { const {settings} = (await window.dook.getWindowState()).data; const result = await window.dook.updateSettings({...settings, themeColor:'#257c68'}); if (!result.ok) throw new Error(result.error) })()`
    )
    await waitFor(
      () =>
        js(
          main,
          `getComputedStyle(document.documentElement).getPropertyValue('--app-accent').trim() === '#257c68'`
        ),
      '保留独立主题色'
    )
    await capture(main, 'appearance-dark-settings.png')
    await capture(note, 'appearance-dark-note.png')
    const bad = await js(
      note,
      `(async () => { const {settings} = (await window.dook.getWindowState()).data; return window.dook.updateSettings({...settings, appearance:'invalid'}) })()`
    )
    assert.equal(bad.ok, false, '拒绝无效外观模式')
    assert.equal((await state()).settings.appearance, 'dark', '拒绝后保持原选择')
    await js(
      note,
      `(async () => {
      const {settings} = (await window.dook.getWindowState()).data;
      await window.dook.updateSettings({...settings, themeColor:'#393939'});
      const task = (await window.dook.createTask('黑灰完成标识')).data;
      await window.dook.setTaskCompleted(task.id, true);
      await window.dook.openWindow('main','task');
    })()`
    )
    await waitFor(
      () => js(main, `Boolean(document.querySelector('.workbench .task-check:checked'))`),
      '完成标识显示'
    )
    const check = await js(
      main,
      `(() => { const box=document.querySelector('.workbench .task-check:checked'); return {ink:getComputedStyle(box,'::before').borderLeftColor, background:getComputedStyle(box).backgroundColor} })()`
    )
    assert.notEqual(check.ink, check.background, '自定义深灰主题的勾号保持可见')
    await capture(main, 'appearance-dark-tasks.png')
    await js(
      note,
      `(async () => { const {settings} = (await window.dook.getWindowState()).data; await window.dook.updateSettings({...settings, themeColor:'#257c68'}) })()`
    )
    const cursor = screen.getCursorScreenPoint
    const area = screen.getPrimaryDisplay().workArea
    let pointer = { x: area.x + area.width - 40, y: area.y + area.height - 40 }
    screen.getCursorScreenPoint = () => pointer
    try {
      await js(note, 'document.activeElement?.blur()')
      note.setPosition(area.x + 5, area.y + 90)
      note.emit('moved')
      pointer = { x: note.getBounds().x + 50, y: note.getBounds().y + 50 }
      await js(note, 'new Promise(resolve => setTimeout(resolve, 180))')
      pointer = { x: area.x + area.width - 40, y: area.y + area.height - 40 }
      await waitFor(async () => (await state()).collapsed, '黑灰便签贴边收起')
      await capture(note, 'appearance-dark-strip.png')
      pointer = { x: area.x + 2, y: note.getBounds().y + 20 }
      await waitFor(async () => (await state()).edgeRevealed, '黑灰胶囊呼出')
      pointer = { x: note.getBounds().x + 18, y: note.getBounds().y + 20 }
      await js(note, 'new Promise(resolve => setTimeout(resolve, 350))')
      await capture(note, 'appearance-dark-capsule.png')
      await click(note, '.edge-handle')
      await waitFor(
        () => js(note, `Boolean(document.querySelector('.note-morph-surface'))`),
        '展开过渡表面'
      )
      assert.notEqual(
        await js(
          note,
          `getComputedStyle(document.querySelector('.note-morph-surface')).backgroundColor`
        ),
        'rgba(0, 0, 0, 0)',
        '黑灰展开过渡保持实体表面'
      )
      await waitFor(
        async () => !(await state()).collapsed && !(await state()).noteMotion,
        '黑灰胶囊展开'
      )
      const { settings } = await state()
      await js(
        note,
        `window.dook.updateSettings(${JSON.stringify({ ...settings, edgeAutoHide: false })})`
      )
    } finally {
      screen.getCursorScreenPoint = cursor
    }
  } finally {
    if (original) Object.defineProperty(nativeTheme, 'shouldUseDarkColors', original)
    else delete nativeTheme.shouldUseDarkColors
  }
}

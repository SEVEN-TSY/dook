import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'
import { assertCompactToast } from './toast-assertions.mjs'

export async function toastSmoke({ main, note, js, click, input, waitFor, capture }) {
  const task = (await js(main, `window.dook.createTask('提示验收任务')`)).data
  const row = `[data-task-id="${task.id}"]`
  const settings = (await js(main, 'window.dook.getWindowState()')).data.settings
  const db = new DatabaseSync(resolve(process.env.DOOK_SMOKE_DATA, 'dook.sqlite'))
  const longError = '保存失败，请稍后重试。' + 'LongErrorWithoutSpaces'.repeat(8)
  const metrics = (window) =>
    js(
      window,
      `(() => {
    const row = document.querySelector('${row}').getBoundingClientRect();
    return { top: row.top, height: innerHeight, width: innerWidth };
  })()`
    )
  try {
    await click(main, '.workbench-nav [aria-label="任务"]')
    for (const appearance of ['light', 'dark']) {
      await js(
        main,
        `window.dook.updateSettings(${JSON.stringify({ ...settings, appearance, themeColor: '#8542ae' })})`
      )
      await waitFor(
        async () =>
          (await js(main, `document.documentElement.dataset.theme`)) === appearance &&
          (await js(note, `document.documentElement.dataset.theme`)) === appearance,
        '两窗口外观同步'
      )
      for (const [kind, window] of [
        ['main', main],
        ['note', note]
      ]) {
        const before = await metrics(window)
        await click(window, `${row} [data-testid=task-description]`)
        await input(window, '[data-testid=task-edit]', '   ')
        await waitFor(
          () =>
            js(window, `Boolean(document.querySelector('[data-sonner-toast][data-type=error]'))`),
          '失败提示'
        )
        await assertCompactToast(window, js, 'error')
        assert.deepEqual(await metrics(window), before, '提示不改变列表位置或窗口尺寸')
        assert.equal(
          await js(window, `document.activeElement.dataset.testid`),
          'task-edit',
          '提示不抢焦点'
        )
        await capture(window, `toast-${kind}-${appearance}-error.png`)
        await waitFor(
          () => js(window, `!document.querySelector('[data-sonner-toast]')`),
          '约3秒自动消失'
        )
        assert.equal(
          await js(window, `document.querySelector('[data-testid=task-edit]').value`),
          '   ',
          '失败后保留草稿'
        )
        // Fail at the storage boundary, preserving the real renderer-to-service path.
        db.exec(
          `CREATE TRIGGER toast_save_failure BEFORE UPDATE ON tasks BEGIN SELECT RAISE(ABORT, '${longError}'); END`
        )
        try {
          await input(window, '[data-testid=task-edit]', '失败后重试')
          await waitFor(
            () =>
              js(
                window,
                `document.querySelector('[data-sonner-toast]')?.textContent.includes('LongErrorWithoutSpaces')`
              ),
            '完整长错误反馈'
          )
          const long = await js(
            window,
            `(() => {
            const t = document.querySelector('[data-sonner-toast]'); const r = t.getBoundingClientRect();
            return { height:r.height, width:r.width, left:r.left, right:r.right,
              overflow:t.scrollWidth > t.clientWidth, text:t.textContent, viewport:innerWidth };
          })()`
          )
          assert.ok(long.height > 38 && long.width <= 280, '长消息在紧凑宽度内换行')
          assert.ok(
            long.left >= 16 && long.right <= long.viewport - 16 && !long.overflow,
            '长连续字符不溢出'
          )
          assert.ok(long.text.includes(longError), '完整保留错误原因')
          await capture(window, `toast-${kind}-${appearance}-long.png`)
        } finally {
          db.exec('DROP TRIGGER toast_save_failure')
        }
        await input(window, '[data-testid=task-edit]', '提示验收任务')
        await waitFor(
          () => js(window, `!document.querySelector('[data-testid=task-edit]')`),
          '原草稿可重试保存'
        )
      }
      await click(main, '.workbench-nav [aria-label="习惯"]')
      const habit = (await js(main, `window.dook.createHabit('提示验收习惯')`)).data
      await click(main, `[data-habit-id="${habit.id}"] [data-testid=habit-schedule]`)
      await click(main, '.habit-schedule-footer button[type=submit]')
      await waitFor(
        () =>
          js(
            main,
            `document.querySelector('[data-sonner-toast][data-type=success]')?.textContent === '定时周期已保存'`
          ),
        '周期保存成功提示'
      )
      await assertCompactToast(main, js, 'success')
      await capture(main, `toast-main-${appearance}-success.png`)
      await waitFor(
        () => js(main, `!document.querySelector('[data-sonner-toast]')`),
        '成功提示自动消失'
      )
      await click(main, '.workbench-nav [aria-label="任务"]')
    }
  } finally {
    db.close()
    await js(main, `window.dook.updateSettings(${JSON.stringify(settings)})`)
  }
}

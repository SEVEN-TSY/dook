import assert from 'node:assert/strict'
import { clipboard } from 'electron'

export function controlReportModel() {
  const requests = []
  let writePhase
  const fetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    if (String(url) !== 'https://api.deepseek.com/chat/completions') return fetch(url, init)
    const { messages, stream } = JSON.parse(init.body)
    let content = 'OK'
    if (messages[0].role === 'system') {
      const material = JSON.parse(messages[1].content)
      requests.push(material)
      const first = material.find((item) => item.completed)
      content = JSON.stringify({
        today: {
          title: '今日工作内容',
          items: [{ sourceIds: [first.id], text: `1、${first.description}` }]
        },
        tomorrow: { title: '明日工作计划', items: [] }
      })
    }
    if (!stream)
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content } }] })
    const encoder = new TextEncoder()
    const chunk = (choice) => encoder.encode(`data: ${JSON.stringify({ choices: [choice] })}\n\n`)
    return new Response(
      new ReadableStream({
        start(controller) {
          const send = (phase) => {
            if (phase === 'reasoning')
              controller.enqueue(chunk({ delta: { reasoning_content: '整理任务' } }))
            else if (phase === 'generating') controller.enqueue(chunk({ delta: { content } }))
            else {
              controller.enqueue(chunk({ finish_reason: 'stop' }))
              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              controller.close()
            }
          }
          writePhase = send
        }
      })
    )
  }
  return { requests, advance: (phase) => writePhase(phase) }
}

export async function dailyReportSmoke({ note, openMain, js, click, input, waitFor, model }) {
  const { requests, advance } = model
  const openReport = async () => {
    await click(note, '[aria-label="打开主界面日报"]')
    return openMain()
  }
  const main = await openReport()
  const headingFocused = () => js(main, 'document.activeElement?.id === "daily-report-heading"')
  await waitFor(headingFocused, '便签首次打开主界面并聚焦日报标题')
  await waitFor(
    () => js(main, `document.querySelector('.daily-report')?.textContent.includes('前往AI设置')`),
    '未配置时显示AI设置入口'
  )
  assert.equal(requests.length, 0)
  await click(main, '.daily-report-actions button')
  await waitFor(() => js(main, 'Boolean(document.querySelector(".page-settings"))'), '先进入设置页')
  await openReport()
  await waitFor(headingFocused, '从设置页重新打开并聚焦日报')

  const fixture = await js(
    note,
    `(async () => {
    const api = window.dook;
    const expect = (result) => { if (!result.ok) throw new Error(result.error); return result.data };
    expect(await api.saveAiConfiguration({ presetId: 'deepseek-flash', key: 'smoke-key' }));
    const today = expect(await api.createTask('发布构建'));
    expect(await api.setTaskCompleted(today.id, true));
    const multi = expect(await api.createTask('隐藏的长期事项'));
    expect(await api.convertToMultiDay(multi.id));
    expect(await api.setTaskCompleted(multi.id, true));
    expect(await api.archiveTask(multi.id));
    const { settings } = expect(await api.getWindowState());
    expect(await api.updateSettings({ ...settings, showMultiDay: false }));
    return { today: today.id, multi: multi.id };
  })()`
  )

  const action = (label) =>
    js(
      main,
      `Array.from(document.querySelectorAll('.daily-report button'))
    .find(button => button.textContent.trim() === ${JSON.stringify(label)})?.click()`
    )
  const buttonReady = (label) =>
    js(
      main,
      `Array.from(document.querySelectorAll('.daily-report button'))
    .some(button => button.textContent.trim() === ${JSON.stringify(label)} &&
      button.getAttribute('aria-disabled') !== 'true')`
    )
  const checkDialog = async () => {
    await waitFor(
      () => js(main, 'Boolean(document.querySelector("[role=alertdialog]"))'),
      '持续推进已隐藏提示'
    )
    const dialog = await js(
      main,
      `(() => {
      const dialog = document.querySelector('[role=alertdialog]');
      return { text: dialog.textContent, actions: Array.from(dialog.querySelectorAll('button')).map(x => x.textContent.trim()) };
    })()`
    )
    assert.match(dialog.text, /不会包含这些任务，包括当天已完成的持续推进任务/)
    assert.deepEqual(dialog.actions, ['取消', '确定'])
  }
  await click(main, '[aria-label="已归档任务"]')
  await waitFor(
    () =>
      js(
        main,
        'document.querySelector("button[aria-label=已归档任务]")?.getAttribute("aria-pressed") === "true"'
      ),
    '已进入归档视图'
  )
  await click(main, '[aria-label="查看日报"]')
  await waitFor(() => buttonReady('生成日报'), '从归档视图打开日报后可以生成')
  await action('生成日报')
  await checkDialog()
  await click(main, '[data-testid=delete-cancel]')
  await waitFor(() => buttonReady('生成日报'), '取消后保留卡片')
  assert.equal(requests.length, 0)
  await action('生成日报')
  await checkDialog()
  await click(main, '[data-testid=delete-confirm]')
  const status = (text) =>
    js(
      main,
      `document.querySelector('.daily-report-details [role=status]')?.textContent === ${JSON.stringify(text)}`
    )
  const cancelIsRed = () =>
    js(main, `(() => {
      const button = document.querySelector('.daily-report-generate[data-cancel]');
      if (!button) return false;
      const sample = document.createElement('span');
      sample.style.color = 'var(--app-error)';
      sample.style.backgroundColor = 'var(--app-error-surface)';
      button.append(sample);
      const expected = getComputedStyle(sample);
      const actual = getComputedStyle(button);
      const match = actual.color === expected.color && actual.backgroundColor === expected.backgroundColor;
      sample.remove();
      return match;
    })()`)
  await waitFor(() => requests.length === 1 && status('正在等待AI响应…'), '等待流式响应')
  await waitFor(cancelIsRed, '首次生成的取消按钮显示红色')
  assert.deepEqual(
    await js(main, "Array.from(document.querySelectorAll('.daily-report-actions button'), button => button.textContent.trim())"),
    ['取消']
  )
  advance('reasoning')
  await waitFor(() => status('正在推理…'), '收到推理片段后更新状态')
  advance('generating')
  await waitFor(() => status('正在生成日报…'), '收到正文片段后更新状态')
  assert.equal(await js(main, 'Boolean(document.querySelector("[aria-label=日报正文]"))'), false)
  advance('done')
  await waitFor(
    () => js(main, 'Boolean(document.querySelector("[aria-label=日报正文]"))'),
    '生成可编辑的日报'
  )
  assert.deepEqual(
    requests[0].map(({ id, description }) => [id, description]),
    [[1, '发布构建']]
  )
  await action('重新生成')
  await checkDialog()
  await click(main, '[data-testid=delete-cancel]')
  await waitFor(() => buttonReady('重新生成'), '重新生成取消后保留正文')
  assert.equal(requests.length, 1)

  const modified = '完成构建并验证\n准备发布'
  const compose = (type) =>
    js(
      main,
      `document.querySelector('[aria-label=日报正文]')
    .dispatchEvent(new CompositionEvent(${JSON.stringify(type)}, { bubbles: true }))`
    )
  await compose('compositionstart')
  await input(main, '[aria-label=日报正文]', modified, null)
  await new Promise((resolve) => setTimeout(resolve, 450))
  assert.match(
    await js(main, '(async () => (await window.dook.reportView()).data.report.body)()'),
    /发布构建/
  )
  await compose('compositionend')
  await waitFor(
    () =>
      js(
        main,
        `(async () =>
    (await window.dook.reportView()).data.report.body === ${JSON.stringify(modified)})()`
      ),
    '手改正文自动保存'
  )
  const date = await js(main, '(async () => (await window.dook.reportView()).data.report.date)()')
  await action('复制全文')
  await waitFor(
    () =>
      js(main, "document.querySelector('[data-sonner-toaster]')?.textContent.includes('已复制')"),
    '显示复制成功'
  )
  assert.equal(
    (await clipboard.readText()).replaceAll('\r\n', '\n'),
    `工作日报｜${date}\n${modified}`
  )
  main.close()
  await waitFor(() => !main.isVisible(), '隐藏主界面')
  await openReport()
  await waitFor(headingFocused, '从隐藏的主界面重新打开同一张卡片')
  assert.equal(await js(main, 'document.querySelector("[aria-label=日报正文]").value'), modified)
  const appearance = (value) =>
    js(
      main,
      `(async () => {
    const { settings } = (await window.dook.getWindowState()).data;
    const result = await window.dook.updateSettings({ ...settings, appearance: ${JSON.stringify(value)} });
    if (!result.ok) throw new Error(result.error);
  })()`
    )
  const editorBackground = () =>
    js(main, "getComputedStyle(document.querySelector('.daily-report-editor')).backgroundColor")
  await appearance('light')
  await waitFor(
    () => js(main, "getComputedStyle(document.documentElement).colorScheme === 'light'"),
    '浅色外观'
  )
  const light = await editorBackground()
  await appearance('dark')
  await waitFor(
    () => js(main, "getComputedStyle(document.documentElement).colorScheme === 'dark'"),
    '深色外观'
  )
  assert.notEqual(await editorBackground(), light)
  main.setSize(...main.getMinimumSize())
  await waitFor(
    () =>
      js(
        main,
        `(() => {
    const card = document.querySelector('.daily-report');
    const actions = card.querySelector('.daily-report-actions');
    return card.scrollWidth <= card.clientWidth && actions.scrollWidth <= actions.clientWidth;
  })()`
      ),
    '窄窗口的正文和操作区无横向溢出'
  )

  await js(note, `window.dook.deleteArchivedTask('${fixture.multi}')`)
  await click(note, `[data-task-id="${fixture.today}"] [data-testid=task-description]`)
  await input(note, '[data-testid=task-edit]', '', null)
  await action('重新生成')
  await waitFor(
    () =>
      js(
        main,
        `document.querySelector('.daily-report-error')?.textContent.includes('桌面便签的任务描述尚未保存')`
      ),
    '便签保存失败后提示编辑类型'
  )
  assert.equal(requests.length, 1)
  assert.equal(await js(note, 'document.querySelector("[data-testid=task-edit]").value'), '')
  await input(note, '[data-testid=task-edit]', '发布构建并核对', null)
  const buttonPositions = () =>
    js(main, `Array.from(document.querySelectorAll('.daily-report-actions button'), button => {
      const { x, y, width, height } = button.getBoundingClientRect();
      return [x, y, width, height].map(Math.round);
    })`)
  const beforeGenerating = await buttonPositions()
  await action('重新生成')
  await waitFor(() => requests.length === 2 && status('正在等待AI响应…'), '重新生成等待响应')
  await waitFor(cancelIsRed, '深色主题的取消按钮显示红色')
  assert.deepEqual(await buttonPositions(), beforeGenerating)
  advance('generating')
  await waitFor(() => status('正在生成日报…'), '重新生成收到正文片段')
  assert.deepEqual(await buttonPositions(), beforeGenerating)
  advance('done')
  await waitFor(
    () =>
      js(main, 'document.querySelector("[aria-label=日报正文]").value.includes("发布构建并核对")'),
    '便签编辑先保存，无隐藏候选时关闭设置仍直接生成'
  )
  assert.equal(requests.length, 2)
  assert.equal(await js(main, 'Boolean(document.querySelector("[role=alertdialog]"))'), false)
}

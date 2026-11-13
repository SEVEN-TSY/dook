import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { AiScenePrompts } from '../src/main/ai/scene-prompts'

test('升级后默认使用内置提示词，切回自定义及重启后恢复已保存内容', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'dook-prompts-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  writeFileSync(join(directory, 'ai-settings.json'), '{"activeId":null,"configurations":[]}')
  const prompts = new AiScenePrompts(directory)
  const initial = prompts.getSettings()
  assert.equal(initial.mode, 'default')
  assert.deepEqual(
    initial.scenes.map(({ name }) => name),
    ['日报', '周报', '月报', '小记归集', '每日提示']
  )
  const dailyDefault = prompts.getEffectivePrompt('daily_report')
  assert.match(dailyDefault, /今日完成/)
  assert.match(dailyDefault, /虚构示例/)
  assert.match(dailyDefault, /60%/)

  prompts.setMode('custom')
  prompts.save('daily_report', '每项一行\n保留项目名称')
  assert.equal(prompts.getEffectivePrompt('daily_report'), '每项一行\n保留项目名称')
  prompts.setMode('default')
  assert.equal(prompts.getEffectivePrompt('daily_report'), dailyDefault)

  const restarted = new AiScenePrompts(directory)
  assert.equal(restarted.getSettings().mode, 'default')
  assert.equal(restarted.getSettings().scenes[0].customPrompt, '每项一行\n保留项目名称')
  restarted.setMode('custom')
  assert.equal(restarted.getEffectivePrompt('daily_report'), '每项一行\n保留项目名称')
})

test('各场景独立保存，恢复单项时保持自定义模式', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'dook-prompts-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const prompts = new AiScenePrompts(directory)
  const { scenes } = prompts.setMode('custom')
  for (const { id, name } of scenes) prompts.save(id, `自定义${name}`)
  const promptDirectory = join(directory, 'ai-scene-prompts')
  assert.equal(JSON.parse(readFileSync(join(directory, 'ai-prompt-mode.json'), 'utf8')), 'custom')
  for (const { id, name } of scenes)
    assert.equal(readFileSync(join(promptDirectory, `${id}.md`), 'utf8'), `自定义${name}`)

  const restored = prompts.reset('weekly_report')
  assert.deepEqual(
    restored.scenes.map(({ customPrompt }) => customPrompt),
    ['自定义日报', null, '自定义月报', '自定义小记归集', '自定义每日提示']
  )
  assert.equal(prompts.getEffectivePrompt('weekly_report'), scenes[1].defaultPrompt)
  assert.equal(existsSync(join(promptDirectory, 'weekly_report.md')), false)
  assert.equal(restored.mode, 'custom')
})

test('拒绝空白提示词、未知场景和无效模式，写入失败时保留已保存内容', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'dook-prompts-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const prompts = new AiScenePrompts(directory)
  prompts.setMode('custom')
  prompts.save('daily_report', '上次保存的内容')

  assert.throws(() => prompts.save('daily_report', ' \n '), /恢复默认/)
  assert.throws(() => prompts.save('new_scene', '新提示词'), /未知/)
  assert.throws(() => prompts.reset('new_scene'), /未知/)
  assert.throws(() => prompts.setMode('other'), /无效/)
  const temporary = join(directory, 'ai-scene-prompts', 'daily_report.md.tmp')
  mkdirSync(temporary)
  assert.throws(() => prompts.save('daily_report', '未保存的内容'), /无法保存/)
  assert.equal(prompts.getEffectivePrompt('daily_report'), '上次保存的内容')
  rmSync(temporary, { recursive: true })
  prompts.save('daily_report', '重试保存的内容')
  assert.equal(prompts.getEffectivePrompt('daily_report'), '重试保存的内容')
})

test('旧JSON分场景迁移，中断后可重试，已恢复的内容重启后不会重新出现', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'dook-prompts-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const legacy = join(directory, 'ai-scene-prompts.json')
  const modeTemporary = join(directory, 'ai-prompt-mode.json.tmp')
  writeFileSync(
    legacy,
    JSON.stringify({
      mode: 'default',
      overrides: { daily_report: '旧日报\n', monthly_report: '旧月报' }
    })
  )
  mkdirSync(modeTemporary)
  const prompts = new AiScenePrompts(directory)
  assert.throws(() => prompts.getSettings(), /无法读取/)
  assert.equal(existsSync(legacy), true)
  rmSync(modeTemporary, { recursive: true })

  const migrated = new AiScenePrompts(directory)
  assert.equal(migrated.getSettings().mode, 'default')
  assert.deepEqual(
    migrated.getSettings().scenes.map(({ customPrompt }) => customPrompt),
    ['旧日报\n', null, '旧月报', null, null]
  )
  assert.equal(existsSync(legacy), false)
  migrated.setMode('custom')
  assert.equal(migrated.getEffectivePrompt('daily_report'), '旧日报\n')
  migrated.reset('daily_report')
  assert.equal(new AiScenePrompts(directory).getSettings().scenes[0].customPrompt, null)
})

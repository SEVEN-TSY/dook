import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { configureLaunchAtLogin } from '../src/main/desktop/login-item'
import { readPreferences, writePreferences } from '../src/main/desktop/preferences'

test('首次使用和旧配置默认开机自启，关闭后重启保留选择', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'mytodo-settings-'))
  try {
    assert.equal(readPreferences(directory).settings.launchAtLogin, true)
    writeFileSync(
      resolve(directory, 'desktop-settings.json'),
      JSON.stringify({ settings: { defaultAlwaysOnTop: false, edgeAutoHide: false }, edge: null })
    )
    const preferences = readPreferences(directory)
    assert.deepEqual(preferences.settings, {
      launchAtLogin: true,
      defaultAlwaysOnTop: false,
      edgeAutoHide: false
    })
    preferences.settings.launchAtLogin = false
    writePreferences(directory, preferences)
    assert.equal(readPreferences(directory).settings.launchAtLogin, false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('Windows安装版将开启和关闭选择传给系统，开发版和其他平台跳过注册', () => {
  const calls: unknown[] = []
  const app = {
    isPackaged: true,
    setLoginItemSettings: (settings: unknown) => {
      calls.push(settings)
    }
  }
  configureLaunchAtLogin(app, true, 'win32')
  configureLaunchAtLogin(app, false, 'win32')
  configureLaunchAtLogin({ ...app, isPackaged: false }, true, 'win32')
  configureLaunchAtLogin(app, true, 'linux')
  assert.deepEqual(calls, [
    { openAtLogin: true, enabled: true },
    { openAtLogin: false, enabled: false }
  ])
})

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { configureLaunchAtLogin } from '../src/main/desktop/login-item'
import { readPreferences, writePreferences } from '../src/main/desktop/preferences'

test('首次使用和旧配置默认开启开机自启、关闭GPU硬件加速，保存后保留选择', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'dook-settings-'))
  try {
    assert.equal(readPreferences(directory).settings.launchAtLogin, true)
    assert.equal(readPreferences(directory).settings.hardwareAcceleration, false)
    writeFileSync(
      resolve(directory, 'desktop-settings.json'),
      JSON.stringify({ settings: { defaultAlwaysOnTop: false, edgeAutoHide: false }, edge: null })
    )
    const preferences = readPreferences(directory)
    assert.deepEqual(preferences.settings, {
      appearance: 'system',
      themeColor: 'system',
      launchAtLogin: true,
      hardwareAcceleration: false,
      defaultAlwaysOnTop: false,
      edgeAutoHide: false,
      locateTaskOnConvert: true,
      showMultiDay: true
    })
    preferences.settings.locateTaskOnConvert = false
    preferences.settings.launchAtLogin = false
    preferences.settings.hardwareAcceleration = true
    writePreferences(directory, preferences)
    assert.equal(readPreferences(directory).settings.launchAtLogin, false)
    assert.equal(readPreferences(directory).settings.hardwareAcceleration, true)
    assert.equal(readPreferences(directory).settings.locateTaskOnConvert, false)
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
    { name: 'com.mytodo.desktop', openAtLogin: false },
    { openAtLogin: true, enabled: true },
    { name: 'com.mytodo.desktop', openAtLogin: false },
    { openAtLogin: false, enabled: false }
  ])
})

test('持续推进默认显示，旧配置兼容且关闭后保存重读保留选择', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'dook-sections-'))
  try {
    assert.equal(readPreferences(directory).settings.showMultiDay, true)
    writeFileSync(
      resolve(directory, 'desktop-settings.json'),
      JSON.stringify({
        settings: { launchAtLogin: false, defaultAlwaysOnTop: false, edgeAutoHide: true }
      })
    )
    const preferences = readPreferences(directory)
    assert.equal(preferences.settings.showMultiDay, true)
    preferences.settings.showMultiDay = false
    writePreferences(directory, preferences)
    assert.deepEqual(readPreferences(directory).settings, {
      appearance: 'system',
      themeColor: 'system',
      launchAtLogin: false,
      hardwareAcceleration: false,
      defaultAlwaysOnTop: false,
      edgeAutoHide: true,
      locateTaskOnConvert: false,
      showMultiDay: false
    })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('主题色默认跟随系统，固定颜色和系统选项均可保存，无效值回退到系统色', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'dook-theme-'))
  try {
    const preferences = readPreferences(directory)
    assert.equal(preferences.settings.themeColor, 'system')
    preferences.settings.themeColor = '#257C68'
    writePreferences(directory, preferences)
    assert.equal(readPreferences(directory).settings.themeColor, '#257c68')
    preferences.settings.themeColor = 'system'
    writePreferences(directory, preferences)
    assert.equal(readPreferences(directory).settings.themeColor, 'system')
    preferences.settings.themeColor = 'invalid'
    writePreferences(directory, preferences)
    assert.equal(readPreferences(directory).settings.themeColor, 'system')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

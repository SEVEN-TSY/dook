import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { DockEdge, WindowSettings } from '../../shared/contracts'

export interface DesktopPreferences {
  settings: WindowSettings
  position?: { x: number; y: number }
  edge: DockEdge | null
}

export function readPreferences(directory: string): DesktopPreferences {
  const defaults: DesktopPreferences = {
    settings: {
      appearance: 'system',
      themeColor: '#526fc4',
      launchAtLogin: true,
      defaultAlwaysOnTop: true,
      edgeAutoHide: true,
      showMultiDay: true
    },
    edge: null
  }
  try {
    const saved = JSON.parse(readFileSync(resolve(directory, 'desktop-settings.json'), 'utf8'))
    if (['system', 'light', 'dark'].includes(saved.settings?.appearance))
      defaults.settings.appearance = saved.settings.appearance
    if (
      typeof saved.settings?.themeColor === 'string' &&
      /^#[0-9a-f]{6}$/i.test(saved.settings.themeColor)
    )
      defaults.settings.themeColor = saved.settings.themeColor.toLowerCase()
    if (typeof saved.settings?.launchAtLogin === 'boolean')
      defaults.settings.launchAtLogin = saved.settings.launchAtLogin
    if (typeof saved.settings?.defaultAlwaysOnTop === 'boolean')
      defaults.settings.defaultAlwaysOnTop = saved.settings.defaultAlwaysOnTop
    if (typeof saved.settings?.edgeAutoHide === 'boolean')
      defaults.settings.edgeAutoHide = saved.settings.edgeAutoHide
    if (typeof saved.settings?.showMultiDay === 'boolean')
      defaults.settings.showMultiDay = saved.settings.showMultiDay
    if (['left', 'right', 'top'].includes(saved.edge)) defaults.edge = saved.edge
    if (Number.isInteger(saved.position?.x) && Number.isInteger(saved.position?.y))
      defaults.position = saved.position
  } catch {
    /* 首次运行或损坏的偏好使用默认值。 */
  }
  if (!defaults.position) {
    try {
      const saved = JSON.parse(readFileSync(resolve(directory, 'note-position.json'), 'utf8'))
      if (Number.isInteger(saved.x) && Number.isInteger(saved.y))
        defaults.position = { x: saved.x, y: saved.y }
    } catch {
      /* 兼容旧版位置；没有旧位置时使用默认值。 */
    }
  }
  return defaults
}

export function writePreferences(directory: string, preferences: DesktopPreferences): void {
  const path = resolve(directory, 'desktop-settings.json')
  writeFileSync(`${path}.tmp`, JSON.stringify(preferences))
  renameSync(`${path}.tmp`, path)
}

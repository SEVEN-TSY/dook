import type { App } from 'electron'

/** 开发与集成验证不注册临时Electron程序。 */
export function configureLaunchAtLogin(
  app: Pick<App, 'isPackaged' | 'setLoginItemSettings'>,
  enabled: boolean,
  platform: NodeJS.Platform = process.platform
): void {
  if (platform !== 'win32' || !app.isPackaged) return
  app.setLoginItemSettings({ name: 'com.mytodo.desktop', openAtLogin: false })
  app.setLoginItemSettings({ openAtLogin: enabled, enabled })
}

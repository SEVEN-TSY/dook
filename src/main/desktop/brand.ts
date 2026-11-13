import { app, nativeImage } from 'electron'
import type { NativeImage } from 'electron'
import { resolve } from 'node:path'

let cached: NativeImage | undefined

/** 窗口和托盘共用同一张已解码图标，避免启动时重复读取PNG。 */
export function appIcon() {
  if (!cached) {
    const root = app.isPackaged ? process.resourcesPath : app.getAppPath()
    cached = nativeImage.createFromPath(resolve(root, 'resources/app-icon.png'))
  }
  return cached
}

import { app, nativeImage } from 'electron'
import { resolve } from 'node:path'

export function appIcon() {
  const root = app.isPackaged ? process.resourcesPath : app.getAppPath()
  return nativeImage.createFromPath(resolve(root, 'resources/app-icon.png'))
}

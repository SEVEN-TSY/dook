import type { ApiResult, DesktopApi } from '../../../shared/contracts'

/** React只依赖此适配层；普通浏览器预览时明确显示桌面桥接不可用。 */
export function getDesktopApi(): DesktopApi {
  if (!window.dook) throw new Error('桌面桥接不可用。请通过npm run dev启动Electron应用。')
  return window.dook
}

export function unwrap<T>(result: ApiResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.data
}

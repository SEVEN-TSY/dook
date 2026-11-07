import type { DesktopApi } from '../../shared/contracts'

declare global {
  interface Window {
    dook?: DesktopApi
  }
}

export {}

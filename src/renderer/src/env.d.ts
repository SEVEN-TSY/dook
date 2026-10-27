import type { DesktopApi } from '../../shared/contracts'

declare global {
  interface Window {
    myTodo?: DesktopApi
  }
}

export {}

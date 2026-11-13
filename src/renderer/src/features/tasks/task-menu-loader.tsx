import type { ComponentProps } from 'react'
import type { TaskMenu as TaskMenuComponent } from './TaskMenu'

type Props = ComponentProps<typeof TaskMenuComponent>

let loaded: typeof TaskMenuComponent | undefined

/** 主窗口在首帧前预载任务菜单；便签窗口从不加载这个Radix菜单块。 */
export async function preloadTaskMenu() {
  loaded ??= (await import('./TaskMenu')).TaskMenu
  return loaded
}

export function TaskMenu(props: Props) {
  const Component = loaded
  if (!Component) return null
  return <Component {...props} />
}

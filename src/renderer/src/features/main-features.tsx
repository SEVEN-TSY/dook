import type { ComponentProps } from 'react'
import type { SettingsPage as SettingsPageComponent } from './settings/SettingsPage'
import type { HabitsPanel as HabitsPanelComponent } from './habits/HabitsPanel'
import type { InspirationPanel as InspirationPanelComponent } from './inspirations/InspirationPanel'
import type { SubitemsPanel as SubitemsPanelComponent } from './tasks/SubitemsPanel'

type SettingsPageProps = ComponentProps<typeof SettingsPageComponent>
type HabitsPanelProps = ComponentProps<typeof HabitsPanelComponent>
type InspirationPanelProps = ComponentProps<typeof InspirationPanelComponent>
type SubitemsPanelProps = ComponentProps<typeof SubitemsPanelComponent>

let settingsPage: typeof SettingsPageComponent | undefined
let habitsPanel: typeof HabitsPanelComponent | undefined
let inspirationPanel: typeof InspirationPanelComponent | undefined
let subitemsPanel: typeof SubitemsPanelComponent | undefined

/** 主窗口在首帧前并行预载主界面专属模块；便签窗口不加载这些chunk。 */
export async function preloadMainFeatures() {
  if (settingsPage) return
  const [settings, habits, inspirations, subitems] = await Promise.all([
    import('./settings/SettingsPage'),
    import('./habits/HabitsPanel'),
    import('./inspirations/InspirationPanel'),
    import('./tasks/SubitemsPanel')
  ])
  settingsPage = settings.SettingsPage
  habitsPanel = habits.HabitsPanel
  inspirationPanel = inspirations.InspirationPanel
  subitemsPanel = subitems.SubitemsPanel
}

export function SettingsPage(props: SettingsPageProps) {
  const Component = settingsPage
  return Component ? <Component {...props} /> : null
}

export function HabitsPanel(props: HabitsPanelProps) {
  const Component = habitsPanel
  return Component ? <Component {...props} /> : null
}

export function InspirationPanel(props: InspirationPanelProps) {
  const Component = inspirationPanel
  return Component ? <Component {...props} /> : null
}

export function SubitemsPanel(props: SubitemsPanelProps) {
  const Component = subitemsPanel
  return Component ? <Component {...props} /> : null
}

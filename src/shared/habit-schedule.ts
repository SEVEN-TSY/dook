import type { HabitSchedule } from './contracts'
import { formatCreatedTime } from './created-time'

export function defaultHabitSchedule(): HabitSchedule {
  return { kind: 'weekly', weekdays: [1, 2, 3, 4, 5], time: '07:00' }
}

export function formatHabitSchedule(schedule?: HabitSchedule): string {
  if (!schedule) return '每天 · 启动时生成'
  if (schedule.kind === 'daily') return `每天 ${schedule.time}`
  if (schedule.kind === 'interval') return `每隔${schedule.intervalDays}天 ${schedule.time}`
  const days = [...new Set(schedule.weekdays ?? [])].sort((a, b) => a - b)
  const names = ['一', '二', '三', '四', '五', '六', '日']
  const label =
    days.join(',') === '1,2,3,4,5'
      ? '周一至周五'
      : `每周${days.map((day) => names[day - 1]).join('、')}`
  return `${label} ${schedule.time}`
}

export function formatNextHabitExecution(value?: string | null, now = new Date()): string {
  if (!value || Number.isNaN(Date.parse(value))) return '未知'
  const date = new Date(value)
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  if (date.toDateString() === now.toDateString()) return `今天 ${time}`
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  if (date.toDateString() === tomorrow.toDateString()) return `明天 ${time}`
  return formatCreatedTime(value, now)
}

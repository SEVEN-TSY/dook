import type { HabitSchedule } from './contracts'

export function defaultHabitSchedule(): HabitSchedule {
  return { kind: 'weekly', weekdays: [1, 2, 3, 4, 5], time: '07:00' }
}

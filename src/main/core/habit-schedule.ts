import type { HabitSchedule } from '../../shared/contracts'

export function parseHabitSchedule(value: unknown): HabitSchedule {
  if (!value || typeof value !== 'object') throw new Error('定时周期无效。')
  const schedule = value as Partial<HabitSchedule>
  if (typeof schedule.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time))
    throw new Error('请选择有效的生成时间。')
  if (schedule.kind === 'daily') return { kind: 'daily', time: schedule.time }
  if (schedule.kind === 'weekly') {
    if (
      !Array.isArray(schedule.weekdays) ||
      !schedule.weekdays.length ||
      schedule.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)
    )
      throw new Error('请至少选择一个星期。')
    return { kind: 'weekly', time: schedule.time, weekdays: [...new Set(schedule.weekdays)].sort() }
  }
  if (
    schedule.kind === 'interval' &&
    Number.isInteger(schedule.intervalDays) &&
    schedule.intervalDays! >= 1 &&
    schedule.intervalDays! <= 365
  )
    return { kind: 'interval', time: schedule.time, intervalDays: schedule.intervalDays }
  throw new Error('间隔天数应为1至365的整数。')
}

/** Compare calendar dates in UTC to avoid daylight-saving changes in day lengths. */
export function habitIsDue(schedule: HabitSchedule | undefined, date: string, now: Date): boolean {
  if (!schedule) return true
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  if (time < schedule.time) return false
  const day = new Date(`${date}T00:00:00Z`)
  if (schedule.kind === 'weekly') return schedule.weekdays!.includes(day.getUTCDay() || 7)
  if (schedule.kind === 'interval') {
    const days = (day.getTime() - Date.parse(`${schedule.startsOn}T00:00:00Z`)) / 86400000
    return days >= 0 && days % schedule.intervalDays! === 0
  }
  return true
}

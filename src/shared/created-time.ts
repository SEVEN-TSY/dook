export function formatCreatedTime(
  value: string | null | undefined,
  now = new Date(),
  precision: 'minute' | 'second' = 'minute'
) {
  if (!value) return '未知'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未知'
  const pad = (number: number) => String(number).padStart(2, '0')
  const seconds = precision === 'second' ? `:${pad(date.getSeconds())}` : ''
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}${seconds}`
  const today =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  return today
    ? time
    : `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${time}`
}

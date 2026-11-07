import { formatCreatedTime } from '../../../../shared/created-time'

export function CreatedTime({ value, label }: { value?: string | null; label?: string }) {
  const valid = !!value && !Number.isNaN(new Date(value).getTime())
  const text = formatCreatedTime(value)
  const fullTime = valid ? new Date(value!).toLocaleString('zh-CN', { hour12: false }) : text
  return (
    <time
      className="created-time"
      dateTime={valid ? value! : undefined}
      title={label ? `${label}：${fullTime}` : valid ? fullTime : '创建时间：未知'}
      aria-label={label ? `${label}：${fullTime}` : undefined}
    >
      {text}
    </time>
  )
}

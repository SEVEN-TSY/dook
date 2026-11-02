import { formatCreatedTime } from '../../../../shared/created-time'

export function CreatedTime({ value }: { value?: string | null }) {
  return (
    <time
      className="created-time"
      dateTime={value || undefined}
      title={value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : undefined}
    >
      {formatCreatedTime(value)}
    </time>
  )
}

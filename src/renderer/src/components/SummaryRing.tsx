/** Desktop note counters. The owner supplies its accessible label. */
export function SummaryRing({
  value,
  total,
  inspiration = false
}: {
  value: number
  total: number
  inspiration?: boolean
}) {
  const progress = total ? Math.min(Math.max(value / total, 0), 1) * 100 : 0
  const taskOutline = 'M0.75 0.75H18a17.25 17.25 0 0 1 0 34.5H0.75Z'
  return (
    <>
      <svg className="note-progress-ring" viewBox="0 0 36 36" aria-hidden="true">
        {inspiration ? (
          <>
            <circle className="note-inspiration-track" cx="18" cy="18" r="17.25" />
            <circle
              className="note-progress-value note-inspiration-value"
              cx="18"
              cy="18"
              r="17.25"
              pathLength="100"
              strokeDasharray={`${progress} 100`}
            />
          </>
        ) : (
          <>
            <path className="note-progress-track" d={taskOutline} />
            <path
              className="note-progress-value"
              d={taskOutline}
              pathLength="100"
              strokeDasharray={`${progress} 100`}
            />
          </>
        )}
      </svg>
      {inspiration ? (
        <span className="note-inspiration-count">{value}</span>
      ) : (
        <span className="note-progress-count">
          <strong>{value}</strong>
          <span>/</span>
          <span>{total}</span>
        </span>
      )}
    </>
  )
}

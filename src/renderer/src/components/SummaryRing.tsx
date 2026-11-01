/** Shared by the desktop note and the main window. The owner supplies its accessible label. */
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
  const radius = inspiration ? 16 : 16.5
  return (
    <>
      <svg className="note-progress-ring" viewBox="0 0 36 36" aria-hidden="true">
        <circle
          className={inspiration ? 'note-inspiration-track' : 'note-progress-track'}
          cx="18"
          cy="18"
          r={radius}
        />
        <circle
          className={`note-progress-value${inspiration ? ' note-inspiration-value' : ''}`}
          cx="18"
          cy="18"
          r={radius}
          pathLength="100"
          strokeDasharray={`${progress} 100`}
        />
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

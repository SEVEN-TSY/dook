export function StatusBadge({
  state,
  children
}: {
  state: 'success' | 'pending' | 'error'
  children: React.ReactNode
}) {
  return (
    <span className={`status-badge ${state}`}>
      <span className="status-dot" />
      {children}
    </span>
  )
}

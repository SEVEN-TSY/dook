export function AppIcon({
  name,
  lit = false
}: {
  name: 'task' | 'habit' | 'inspiration' | 'settings' | 'note' | 'add'
  lit?: boolean
}) {
  const paths = {
    add: <path d="M10 4v12M4 10h12" />,
    task: (
      <>
        <rect x="3.5" y="4" width="13" height="13" rx="3" />
        <path d="m7 10 2 2 4-4" />
      </>
    ),
    habit: (
      <>
        <path d="M15.5 7A6 6 0 0 0 5 6L3.5 8M4.5 13A6 6 0 0 0 15 14l1.5-2" />
        <path d="M3.5 4.5V8H7M16.5 15.5V12H13" />
      </>
    ),
    inspiration: (
      <>
        <path
          d="M7 14c0-1.6-2.5-2.7-2.5-5a5.5 5.5 0 0 1 11 0c0 2.3-2.5 3.4-2.5 5Z"
          fill={lit ? '#f4ca55' : 'none'}
        />
        <path d="M8 17h4" />
        {lit && <path d="M10 0.5v1M1 8h1m16 0h1M2.5 2.5l1 1m13-1-1 1" />}
      </>
    ),
    settings: (
      <>
        <circle cx="10" cy="10" r="3" />
        <path d="m8 2-.5 2-1.5.9-2-.6-2 3.4L3.5 9v2L2 12.3l2 3.4 2-.6 1.5.9.5 2h4l.5-2 1.5-.9 2 .6 2-3.4-1.5-1.3V9L18 7.7l-2-3.4-2 .6-1.5-.9-.5-2Z" />
      </>
    ),
    note: (
      <>
        <rect x="4" y="3.5" width="12" height="13" rx="2" />
        <path d="M7 7h6M7 10h6M7 13h3" />
      </>
    )
  }
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

export function TaskActionIcon({
  name
}: {
  name: 'convert' | 'habit' | 'schedule' | 'pin' | 'unpin' | 'delete' | 'restore'
}) {
  const paths = {
    convert: 'M5 5 15 15M5 15h10V5',
    habit: 'M15.2 7A6 6 0 1 0 16 12M15.2 3.5V7h-3.5',
    schedule: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM10 6v4l3 2',
    pin: 'M4 4h12M10 16V7m-4 4 4-4 4 4',
    unpin: 'M4 16h12M10 4v9m-4-4 4 4 4-4',
    delete: 'M5 5l10 10M15 5 5 15',
    restore: 'M7 4 3 8l4 4M3 8h8a5 5 0 0 1 0 10'
  }
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}

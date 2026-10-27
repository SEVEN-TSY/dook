type IconName =
  | 'check'
  | 'grid'
  | 'circle'
  | 'spark'
  | 'settings'
  | 'arrow'
  | 'play'
  | 'code'
  | 'database'
  | 'link'
  | 'terminal'
  | 'folder'

const paths: Record<IconName, string> = {
  check: 'm5 12 4 4L19 6',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  circle: 'M12 3a9 9 0 1 0 9 9 M12 3v9h9',
  spark: 'm12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8Z',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',
  arrow: 'M4 12h16 m-5-5 5 5-5 5',
  play: 'm8 5 11 7-11 7Z',
  code: 'm8 7-5 5 5 5 m8-10 5 5-5 5 M14 4l-4 16',
  database:
    'M20 5c0 2-3.6 3-8 3S4 7 4 5s3.6-3 8-3 8 1 8 3Z M4 5v14c0 2 3.6 3 8 3s8-1 8-3V5 M4 12c0 2 3.6 3 8 3s8-1 8-3',
  link: 'm10 13 4-4 M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0 M16 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
  terminal: 'm4 6 6 6-6 6 M13 18h7',
  folder: 'M3 5h6l2 3h10v12H3Z'
}

export function Icon({
  name,
  size = 20,
  className = ''
}: {
  name: IconName
  size?: number
  className?: string
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}

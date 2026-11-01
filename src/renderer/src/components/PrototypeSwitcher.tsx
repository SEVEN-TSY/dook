import { useEffect } from 'react'

export const prototypeVariants = ['A', 'B', 'C'] as const
export type PrototypeVariant = (typeof prototypeVariants)[number]
export const prototypeNames = { A: '双栏列表', B: '连续阅读', C: '分组导航' }

export function PrototypeSwitcher({
  current,
  onChange,
  state
}: {
  current: PrototypeVariant
  onChange: (variant: PrototypeVariant) => void
  state: unknown
}) {
  const cycle = (step: number) =>
    onChange(prototypeVariants[(prototypeVariants.indexOf(current) + step + 3) % 3])
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('input, textarea, select, [contenteditable]')
      )
        return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        cycle(event.key === 'ArrowLeft' ? -1 : 1)
      }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [current])
  if (!import.meta.env.DEV) return null
  return (
    <div className="ip-switcher">
      <span className="ip-prototype-label">探索原型</span>
      <button aria-label="上一个方案" onClick={() => cycle(-1)}>
        ←
      </button>
      <span>
        {current} · {prototypeNames[current]}
      </span>
      <button aria-label="下一个方案" onClick={() => cycle(1)}>
        →
      </button>
      <details>
        <summary>状态</summary>
        <pre>{JSON.stringify(state, null, 2)}</pre>
      </details>
    </div>
  )
}

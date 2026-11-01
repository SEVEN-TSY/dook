import { useEffect, useRef } from 'react'

export function useSummaryMotion(count: number | undefined, shrinkOnDecrease = false) {
  const element = useRef<HTMLButtonElement>(null)
  const previousCount = useRef(count)
  const animation = useRef<Animation | null>(null)
  useEffect(() => () => animation.current?.cancel(), [])
  useEffect(() => {
    const previous = previousCount.current
    previousCount.current = count
    if (
      count === undefined ||
      previous === undefined ||
      count === previous ||
      (count < previous && !shrinkOnDecrease)
    )
      return
    const target = element.current
    if (!target) return
    const growing = count > previous
    const transform = getComputedStyle(target).transform
    animation.current?.cancel()
    animation.current = target.animate(
      [
        { transform: transform === 'none' ? 'scale(1)' : transform },
        { transform: `scale(${growing ? 1.18 : 0.82})`, offset: 0.38 },
        { transform: `scale(${growing ? 0.98 : 1.02})`, offset: 0.72 },
        { transform: 'scale(1)' }
      ],
      { duration: 420, easing: 'ease-out' }
    )
  }, [count, shrinkOnDecrease])
  return element
}

import type { Display, Rectangle } from 'electron'
import type { DockEdge } from '../../shared/contracts'

const overlap = (a: number, lengthA: number, b: number, lengthB: number) =>
  a < b + lengthB && b < a + lengthA

/** 按窗口覆盖的边缘区段检查外侧，排除错位双屏的部分内部接缝。 */
export function isOuterEdge(
  display: Display,
  edge: DockEdge,
  bounds: Rectangle,
  displays: Display[]
): boolean {
  const area = display.workArea
  const boundary = edge === 'left' ? area.x : edge === 'right' ? area.x + area.width : area.y
  return !displays.some((other) => {
    if (other.id === display.id) return false
    const otherBounds = other.bounds
    if (edge === 'top')
      return (
        otherBounds.y < boundary &&
        otherBounds.y + otherBounds.height >= boundary &&
        overlap(bounds.x, bounds.width, otherBounds.x, otherBounds.width)
      )
    const beyond =
      edge === 'left'
        ? otherBounds.x < boundary && otherBounds.x + otherBounds.width >= boundary
        : otherBounds.x <= boundary && otherBounds.x + otherBounds.width > boundary
    return beyond && overlap(bounds.y, bounds.height, otherBounds.y, otherBounds.height)
  })
}

export function visibleBounds(bounds: Rectangle, display: Display): Rectangle {
  const area = display.workArea
  const width = Math.min(bounds.width, area.width)
  const height = Math.min(bounds.height, area.height)
  return {
    width,
    height,
    x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)))
  }
}

export function snapBounds(bounds: Rectangle, display: Display, edge: DockEdge): Rectangle {
  const next = visibleBounds(bounds, display)
  if (edge === 'left') next.x = display.workArea.x
  if (edge === 'right') next.x = display.workArea.x + display.workArea.width - next.width
  if (edge === 'top') next.y = display.workArea.y
  return next
}

export function nearbyEdge(
  bounds: Rectangle,
  display: Display,
  displays: Display[]
): DockEdge | null {
  const distances: [DockEdge, number][] = [
    ['left', Math.abs(bounds.x - display.workArea.x)],
    ['right', Math.abs(bounds.x + bounds.width - display.workArea.x - display.workArea.width)],
    ['top', Math.abs(bounds.y - display.workArea.y)]
  ]
  return (
    distances
      .sort((a, b) => a[1] - b[1])
      .find(
        ([edge, distance]) => distance <= 16 && isOuterEdge(display, edge, bounds, displays)
      )?.[0] ?? null
  )
}

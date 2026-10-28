import { useLayoutEffect, useRef } from 'react'
import type { DesktopState } from '../../../../shared/contracts'
import { getDesktopApi } from '../../platform/desktop'

/** 独立共享表面做FLIP投影，列表和数字独立交接，避免跟随表面缩放。 */
export function NoteTransition({
  desktop,
  completed,
  total
}: {
  desktop: DesktopState
  completed: number
  total: number
}) {
  const surface = useRef<HTMLDivElement>(null)
  const source = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const page = document.querySelector<HTMLElement>('.tasks-page.note')
    const shell = surface.current
    if (!page || !shell || !desktop.edge || !desktop.noteMotion) return
    const opening = desktop.noteMotion === 'opening'
    const fromCapsule = opening && desktop.noteMotionSource === 'capsule'
    const edge = desktop.edge
    const target = page.getBoundingClientRect()
    const compact =
      edge === 'top'
        ? { x: 8, y: fromCapsule ? 0 : 1, width: 60, height: fromCapsule ? 28 : 4 }
        : {
            x: edge === 'left' ? (fromCapsule ? 0 : 1) : innerWidth - (fromCapsule ? 28 : 5),
            y: 8,
            width: fromCapsule ? 28 : 4,
            height: 60
          }
    Object.assign(shell.style, {
      left: `${target.x}px`,
      top: `${target.y}px`,
      width: `${target.width}px`,
      height: `${target.height}px`
    })
    const compactScaleX = compact.width / target.width
    const compactScaleY = compact.height / target.height
    const duration = opening ? 460 : 300
    const keyframes: Keyframe[] = Array.from({ length: 61 }, (_, index) => {
      const time = index / 60
      // 阻尼弹簧解：轻微越过终点后回落，终帧严格落在终态。
      const spring =
        index === 60
          ? 1
          : 1 - Math.exp(-10 * time) * (Math.cos(7 * time) + (10 / 7) * Math.sin(7 * time))
      const travel = opening ? spring : 1 - (1 - time) ** 3
      const amount = opening ? travel : 1 - travel
      const scaleX = Math.max(0.002, compactScaleX + (1 - compactScaleX) * amount)
      const scaleY = Math.max(0.002, compactScaleY + (1 - compactScaleY) * amount)
      const x = (compact.x - target.x) * (1 - amount)
      const y = (compact.y - target.y) * (1 - amount)
      const radius =
        (fromCapsule ? 14 : 2) + (12 - (fromCapsule ? 14 : 2)) * Math.min(1, Math.max(0, amount))
      const tone = Math.min(1, Math.max(0, amount))
      return {
        offset: time,
        transform: `translate3d(${x}px, ${y}px, 0) scale(${scaleX}, ${scaleY})`,
        // 反向修正圆角，使表面由胶囊自然过渡，不拉成长椭圆。
        borderRadius: `${radius / scaleX}px / ${radius / scaleY}px`,
        backgroundColor: `rgb(${240 + 10 * tone}, ${244 + 7 * tone}, ${252 + 2 * tone})`
      }
    })
    const shape = shell.animate(keyframes, { duration, easing: 'linear', fill: 'both' })
    const content = page.animate(
      opening
        ? [{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }]
        : [{ opacity: 1 }, { opacity: 0, offset: 0.32 }, { opacity: 0 }],
      { duration, easing: 'linear', fill: 'both' }
    )
    const snapshot = source.current
    let snapshotMotion: Animation | undefined
    if (snapshot && fromCapsule) {
      Object.assign(snapshot.style, {
        left: `${compact.x}px`,
        top: `${compact.y}px`,
        width: `${compact.width}px`,
        height: `${compact.height}px`
      })
      snapshotMotion = snapshot.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 120,
        fill: 'both'
      })
    }
    void shape.finished
      .then(() => getDesktopApi().finishNoteMotion(desktop.noteMotionRevision ?? 0))
      .catch(() => {})
    return () => {
      shape.cancel()
      content.cancel()
      snapshotMotion?.cancel()
    }
  }, [desktop.edge, desktop.noteMotion, desktop.noteMotionRevision, desktop.noteMotionSource])
  return (
    <div className="note-morph" aria-hidden="true">
      <div ref={surface} className="note-morph-surface" />
      {desktop.noteMotion === 'opening' && desktop.noteMotionSource === 'capsule' && (
        <div
          ref={source}
          className={`edge-handle capsule-visible revealed note-morph-source ${desktop.edge}`}
        >
          <span className="edge-capsule-summary">
            <span className="edge-capsule-tasks">
              <span className="edge-capsule-numbers">
                <strong>{completed}</strong>
                <span className="edge-capsule-slash">/</span>
                <span className="edge-capsule-total">{total}</span>
              </span>
            </span>
          </span>
        </div>
      )}
    </div>
  )
}

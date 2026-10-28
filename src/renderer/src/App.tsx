import { TasksPage } from './features/tasks/TasksPage'
import { useEffect, useRef, useState } from 'react'
import type { DesktopState } from '../../shared/contracts'
import { getDesktopApi, unwrap } from './platform/desktop'
import { useTasks } from './features/tasks/useTasks'
import { NoteTransition } from './features/tasks/NoteTransition'

export function App() {
  const tasks = useTasks()
  const total = tasks.today?.tasks.length ?? 0
  const completed = tasks.today?.tasks.filter((task) => task.completed).length ?? 0
  const progress = total ? (completed / total) * 100 : 0
  const edgePress = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const summary = total ? `总进度${progress}%，已完成${completed}/${total}项任务` : '暂无任务'
  const [desktop, setDesktop] = useState<DesktopState | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const api = getDesktopApi()
    let receivedChange = false
    const applyState = (state: DesktopState) => {
      // 同步阻止新的人机输入，避免退出屏障确认后、另一窗口尚在保存时再次变更。
      document.body.inert = state.exitPending
      setDesktop(state)
    }
    const unsubscribe = api.onWindowState((state) => {
      receivedChange = true
      applyState(state)
    })
    void api
      .getWindowState()
      .then(unwrap)
      .then((state) => {
        if (!receivedChange) applyState(state)
      })
      .catch((error) => setError(String(error)))
    return () => {
      unsubscribe()
      document.body.inert = false
    }
  }, [])
  const kind =
    new URLSearchParams(window.location.search).get('window') === 'note' ? 'note' : 'main'
  const collapsed = kind === 'note' && Boolean(desktop?.collapsed)
  useEffect(() => {
    document.documentElement.dataset.window = kind
  }, [kind])
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {desktop?.exitPending && <div className="exit-pending">正在保存并退出…</div>}
      <TasksPage
        kind={kind}
        desktop={desktop}
        hidden={collapsed}
        tasks={tasks}
      />
      {kind === 'note' && desktop?.noteMotion && (
        <NoteTransition desktop={desktop} completed={completed} total={total} />
      )}
      {collapsed && (
        <button
          className={`edge-handle ${desktop?.edge} ${desktop?.edgeCapsuleVisible ? 'capsule-visible' : ''} ${desktop?.edgeCapsulePreparing ? 'capsule-preparing' : ''} ${desktop?.edgeRevealed ? 'revealed' : ''}`}
          aria-label={`展开桌面便签，${summary}`}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.currentTarget.setPointerCapture(event.pointerId)
            edgePress.current = { x: event.screenX, y: event.screenY, moved: false }
            void getDesktopApi().setNoteDragging(true)
          }}
          onPointerMove={(event) => {
            const press = edgePress.current
            if (press && Math.hypot(event.screenX - press.x, event.screenY - press.y) >= 4)
              press.moved = true
          }}
          onPointerUp={(event) => {
            const press = edgePress.current
            if (press && Math.hypot(event.screenX - press.x, event.screenY - press.y) >= 4)
              press.moved = true
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId)
          }}
          onLostPointerCapture={() => void getDesktopApi().setNoteDragging(false)}
          onPointerCancel={() => {
            if (edgePress.current) edgePress.current.moved = true
            void getDesktopApi().setNoteDragging(false)
          }}
          onClick={async (event) => {
            const dragged = edgePress.current?.moved
            edgePress.current = null
            const pointerClick = event.detail > 0
            const result = await getDesktopApi().setNoteDragging(false)
            if (!dragged && !(pointerClick && result.ok && result.data))
              void getDesktopApi().openWindow('note')
          }}
        >
          <span className="edge-strip" aria-hidden="true">
            <span
              className="edge-energy-fill"
              style={
                desktop?.edge === 'top'
                  ? { width: `${progress}%`, height: '100%' }
                  : { height: `${progress}%` }
              }
            />
          </span>
          <span className="edge-energy" aria-hidden="true">
            <span
              className="edge-energy-fill"
              style={
                desktop?.edge === 'top'
                  ? { width: `${progress}%`, height: '100%' }
                  : { height: `${progress}%` }
              }
            />
            <span className="edge-capsule-summary">
              <span className="edge-capsule-tasks">
                <span className="edge-capsule-numbers">
                  <strong>{completed}</strong>
                  <span className="edge-capsule-slash">/</span>
                  <span className="edge-capsule-total">{total}</span>
                </span>
              </span>
            </span>
          </span>
        </button>
      )}
    </>
  )
}

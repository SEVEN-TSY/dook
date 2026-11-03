import { TasksPage } from './features/tasks/TasksPage'
import { useEffect, useRef, useState } from 'react'
import type { DesktopState } from '../../shared/contracts'
import { getDesktopApi, unwrap } from './platform/desktop'
import { useTasks } from './features/tasks/useTasks'
import { NoteTransition } from './features/tasks/NoteTransition'
import { taskSummary } from './features/tasks/taskSummary'
import { DeleteConfirmationProvider } from './components/DeleteConfirmation'
import { Toaster } from './components/ui/sonner'

export function App() {
  const tasks = useTasks()
  const [desktop, setDesktop] = useState<DesktopState | null>(null)
  const { total, completed } = taskSummary(tasks.today?.tasks, desktop?.settings.showMultiDay)
  const progress = total ? (completed / total) * 100 : 0
  const edgePress = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const summary = total ? `总进度${progress}%，已完成${completed}/${total}项任务` : '暂无任务'
  const [error, setError] = useState('')
  useEffect(() => {
    const color = desktop?.settings.themeColor ?? '#526fc4'
    const channels = color
      .slice(1)
      .match(/.{2}/g)!
      .map((part) => {
        const value = parseInt(part, 16) / 255
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      })
    const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
    document.documentElement.style.setProperty('--app-accent', color)
    document.documentElement.style.setProperty(
      '--app-accent-foreground',
      luminance > 0.179 ? '#202734' : '#ffffff'
    )
  }, [desktop?.settings.themeColor])
  useEffect(() => {
    const api = getDesktopApi()
    let receivedChange = false
    const applyState = (state: DesktopState) => {
      // 同步阻止新的人机输入，避免退出屏障确认后、另一窗口尚在保存时再次变更。
      document.body.inert = state.exitPending
      document.documentElement.dataset.theme = state.colorScheme
      document.documentElement.classList.toggle('dark', state.colorScheme === 'dark')
      document.documentElement.style.colorScheme = state.colorScheme
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
      {kind === 'main' && <div className="main-window-drag-region" aria-hidden="true" />}
      {error && <p role="alert">{error}</p>}
      {desktop?.exitPending && <div className="exit-pending">正在保存并退出…</div>}
      <DeleteConfirmationProvider>
        <TasksPage kind={kind} desktop={desktop} hidden={collapsed} tasks={tasks} />
      </DeleteConfirmationProvider>
      <Toaster
        theme={desktop?.colorScheme ?? 'system'}
        offset={kind === 'note' ? 48 : 16}
        mobileOffset={kind === 'note' ? 48 : 16}
        style={collapsed ? { display: 'none' } : undefined}
      />
      {kind === 'note' && desktop?.noteMotion && (
        <NoteTransition desktop={desktop} />
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

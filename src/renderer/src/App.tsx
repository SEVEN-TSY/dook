import { TasksPage } from './features/tasks/TasksPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { useEffect, useState } from 'react'
import type { DesktopState } from '../../shared/contracts'
import { getDesktopApi, unwrap } from './platform/desktop'

export function App() {
  const [desktop, setDesktop] = useState<DesktopState | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
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
        hidden={collapsed || settingsOpen}
        openSettings={() => setSettingsOpen(true)}
      />
      {kind === 'main' && (
        <SettingsPage state={desktop} close={() => setSettingsOpen(false)} hidden={!settingsOpen} />
      )}
      {collapsed && (
        <button
          className={`edge-handle ${desktop?.edge}`}
          aria-label="展开桌面便签"
          onClick={() => void getDesktopApi().openWindow('note')}
        />
      )}
    </>
  )
}

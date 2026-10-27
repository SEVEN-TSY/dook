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
    const unsubscribe = api.onWindowState((state) => {
      receivedChange = true
      setDesktop(state)
    })
    void api
      .getWindowState()
      .then(unwrap)
      .then((state) => {
        if (!receivedChange) setDesktop(state)
      })
      .catch((error) => setError(String(error)))
    return unsubscribe
  }, [])
  const kind =
    new URLSearchParams(window.location.search).get('window') === 'note' ? 'note' : 'main'
  const collapsed = kind === 'note' && Boolean(desktop?.collapsed)
  return (
    <>
      {error && <p role="alert">{error}</p>}
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

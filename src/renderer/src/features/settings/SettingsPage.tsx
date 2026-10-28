import { useState } from 'react'
import type { DesktopState, WindowSettings } from '../../../../shared/contracts'
import { getDesktopApi, unwrap } from '../../platform/desktop'

export function SettingsPage({
  state,
  close,
  hidden
}: {
  state: DesktopState | null
  close: () => void
  hidden: boolean
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const update = async (settings: WindowSettings) => {
    setBusy(true)
    setError('')
    try {
      unwrap(await getDesktopApi().updateSettings(settings))
    } catch (error) {
      setError(error instanceof Error ? error.message : '设置保存失败。')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="settings-page" hidden={hidden}>
      <button className="back-button" onClick={close}>
        ← 返回今天任务
      </button>
      <h1>设置</h1>
      <p className="settings-intro">桌面便签</p>
      <label className="setting-row">
        <span>
          <strong>默认是否置顶</strong>
          <small>立即应用到便签并记住。贴边时保持置顶。</small>
        </span>
        <input
          data-testid="default-pin"
          type="checkbox"
          checked={state?.settings.defaultAlwaysOnTop ?? true}
          disabled={!state || busy}
          onChange={(event) =>
            state && void update({ ...state.settings, defaultAlwaysOnTop: event.target.checked })
          }
        />
      </label>
      <label className="setting-row">
        <span>
          <strong>贴边自动隐藏</strong>
          <small>拖近左、右、上外侧边缘后吸附，悬停查看统计，点击展开。</small>
        </span>
        <input
          data-testid="edge-auto-hide"
          type="checkbox"
          checked={state?.settings.edgeAutoHide ?? true}
          disabled={!state || busy}
          onChange={(event) =>
            state && void update({ ...state.settings, edgeAutoHide: event.target.checked })
          }
        />
      </label>
      {error && (
        <p role="alert" className="task-error">
          {error}
        </p>
      )}
      <p className="settings-hint">关闭窗口后，myTodo继续在系统托盘运行。</p>
    </section>
  )
}

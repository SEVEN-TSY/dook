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
      <section className="settings-group" aria-label="系统偏好">
        <h2 className="settings-intro">系统偏好</h2>
        <label className="setting-row">
          <span>
            <strong>开机自启</strong>
            <small>登录Windows后自动启动myTodo，安装版生效。</small>
          </span>
          <input
            data-testid="launch-at-login"
            type="checkbox"
            role="switch"
            checked={state?.settings.launchAtLogin ?? true}
            disabled={!state || busy}
            onChange={(event) =>
              state && void update({ ...state.settings, launchAtLogin: event.target.checked })
            }
          />
        </label>
      </section>
      <section className="settings-group" aria-label="便签偏好">
        <h2 className="settings-intro">便签偏好</h2>
        <label className="setting-row">
          <span>
            <strong>默认是否置顶</strong>
            <small>立即应用到便签并记住。贴边时保持置顶。</small>
          </span>
          <input
            data-testid="default-pin"
            type="checkbox"
            role="switch"
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
            role="switch"
            checked={state?.settings.edgeAutoHide ?? true}
            disabled={!state || busy}
            onChange={(event) =>
              state && void update({ ...state.settings, edgeAutoHide: event.target.checked })
            }
          />
        </label>
        <label className="setting-row">
          <span>
            <strong>显示持续推进</strong>
            <small>关闭后便签只显示这就去做和已归档，任务仍保留在主界面。</small>
          </span>
          <input
            data-testid="show-multi-day"
            type="checkbox"
            role="switch"
            checked={state?.settings.showMultiDay ?? true}
            disabled={!state || busy}
            onChange={(event) =>
              state && void update({ ...state.settings, showMultiDay: event.target.checked })
            }
          />
        </label>
      </section>
      {error && (
        <p role="alert" className="task-error">
          {error}
        </p>
      )}
      <p className="settings-hint">关闭窗口后，myTodo继续在系统托盘运行。</p>
    </section>
  )
}

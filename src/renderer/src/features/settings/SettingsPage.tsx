import { useEffect, useState } from 'react'
import { Check, Copyright, Palette, Monitor, StickyNote, Sun, Moon } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Switch } from '../../components/ui/switch'
import type { DesktopState, WindowSettings } from '../../../../shared/contracts'
import { getDesktopApi, unwrap } from '../../platform/desktop'

export function SettingsPage({ state, hidden }: { state: DesktopState | null; hidden: boolean }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const color = state?.settings.themeColor ?? '#526fc4'
  const [customColor, setCustomColor] = useState(color)
  useEffect(() => setCustomColor(color), [color])
  const presets = [
    ['雾蓝', '#526fc4'],
    ['青绿', '#257c68'],
    ['鸢紫', '#7955b3'],
    ['玫瑰', '#b34f71'],
    ['琥珀', '#9a6b20'],
    ['石墨', '#526071']
  ] as const
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
      <section className="settings-group settings-personalization" aria-label="个性化">
        <h2 className="settings-intro">
          <span className="settings-category-icon">
            <Palette size={17} />
          </span>
          个性化
        </h2>
        <div className="appearance-setting">
          <div className="theme-setting-label">
            <strong>外观</strong>
          </div>
          <ToggleGroup
            type="single"
            value={state?.settings.appearance ?? 'system'}
            onValueChange={(appearance) => {
              if (
                state &&
                (appearance === 'system' || appearance === 'light' || appearance === 'dark')
              )
                void update({ ...state.settings, appearance })
            }}
            disabled={!state || busy}
            variant="outline"
            spacing={0}
            aria-label="外观模式"
            className="mt-3"
          >
            {(
              [
                ['system', '随系统', Monitor],
                ['light', '浅色', Sun],
                ['dark', '深色', Moon]
              ] as const
            ).map(([value, label, Icon]) => (
              <ToggleGroupItem
                key={value}
                value={value}
                className="gap-2 px-4 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground"
                aria-label={`${label}外观`}
              >
                <Icon size={16} strokeWidth={1.7} aria-hidden="true" />
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="theme-setting">
          <div className="theme-setting-label">
            <strong>主题色</strong>
            <span>应用到主界面和桌面便签</span>
          </div>
          <div className="theme-presets" role="group" aria-label="预设主题色">
            {presets.map(([name, value]) => (
              <button
                type="button"
                key={value}
                className="theme-preset"
                aria-label={`${name}主题`}
                aria-pressed={color === value}
                disabled={!state || busy}
                onClick={() => state && void update({ ...state.settings, themeColor: value })}
              >
                <span className="theme-swatch" style={{ backgroundColor: value }}>
                  {color === value && <Check size={15} />}
                </span>
                <span>{name}</span>
              </button>
            ))}
          </div>
          <div className="theme-custom">
            <span className="theme-custom-label">自定义</span>
            <label className="theme-color-picker" title="选择自定义颜色">
              <input
                type="color"
                aria-label="自定义主题色"
                value={/^#[0-9a-f]{6}$/i.test(customColor) ? customColor : color}
                disabled={!state || busy}
                onChange={(event) => setCustomColor(event.target.value)}
              />
            </label>
            <Input
              aria-label="主题色十六进制值"
              className="theme-hex w-28"
              value={customColor}
              onClear={() => setCustomColor('')}
              maxLength={7}
              disabled={!state || busy}
              onChange={(event) => setCustomColor(event.target.value)}
            />
            <Button
              data-testid="theme-apply"
              size="sm"
              variant="outline"
              disabled={
                !state ||
                busy ||
                !/^#[0-9a-f]{6}$/i.test(customColor) ||
                customColor.toLowerCase() === color
              }
              onClick={() =>
                state && void update({ ...state.settings, themeColor: customColor.toLowerCase() })
              }
            >
              应用颜色
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!state || busy || color === '#526fc4'}
              onClick={() => state && void update({ ...state.settings, themeColor: '#526fc4' })}
            >
              恢复默认
            </Button>
          </div>
        </div>
      </section>
      <section className="settings-group settings-system" aria-label="系统偏好">
        <h2 className="settings-intro">
          <span className="settings-category-icon">
            <Monitor size={17} />
          </span>
          系统偏好
        </h2>
        <label className="setting-row">
          <span>
            <strong>开机自启</strong>
            <small>登录Windows后自动启动DOOK，安装版生效。</small>
          </span>
          <Switch
            data-testid="launch-at-login"
            checked={state?.settings.launchAtLogin ?? true}
            disabled={!state || busy}
            onCheckedChange={(checked) =>
              state && void update({ ...state.settings, launchAtLogin: checked })
            }
          />
        </label>
        <label className="setting-row">
          <span>
            <strong>显示持续推进</strong>
            <small>关闭后主界面和便签均隐藏持续推进，不计入任务统计，任务数据仍保留。</small>
          </span>
          <Switch
            data-testid="show-multi-day"
            checked={state?.settings.showMultiDay ?? true}
            disabled={!state || busy}
            onCheckedChange={(checked) =>
              state &&
              void update({
                ...state.settings,
                showMultiDay: checked,
                locateTaskOnConvert: checked
              })
            }
          />
        </label>
        <label className="setting-row">
          <span>
            <strong>转换后定位并高亮任务</strong>
            <small>主界面和便签转换任务后，自动定位并让背景呼吸两次。</small>
          </span>
          <Switch
            data-testid="locate-task-on-convert"
            checked={Boolean(state?.settings.showMultiDay && state.settings.locateTaskOnConvert)}
            disabled={!state || busy || !state.settings.showMultiDay}
            onCheckedChange={(checked) =>
              state && void update({ ...state.settings, locateTaskOnConvert: checked })
            }
          />
        </label>
      </section>
      <section className="settings-group settings-note" aria-label="便签偏好">
        <h2 className="settings-intro">
          <span className="settings-category-icon">
            <StickyNote size={17} />
          </span>
          便签偏好
        </h2>
        <label className="setting-row">
          <span>
            <strong>默认是否置顶</strong>
            <small>立即应用到便签并记住。贴边时保持置顶。</small>
          </span>
          <Switch
            data-testid="default-pin"
            checked={state?.settings.defaultAlwaysOnTop ?? true}
            disabled={!state || busy}
            onCheckedChange={(checked) =>
              state && void update({ ...state.settings, defaultAlwaysOnTop: checked })
            }
          />
        </label>
        <label className="setting-row">
          <span>
            <strong>贴边自动隐藏</strong>
            <small>拖近左、右、上外侧边缘后吸附，悬停查看统计，点击展开。</small>
          </span>
          <Switch
            data-testid="edge-auto-hide"
            checked={state?.settings.edgeAutoHide ?? true}
            disabled={!state || busy}
            onCheckedChange={(checked) =>
              state && void update({ ...state.settings, edgeAutoHide: checked })
            }
          />
        </label>
      </section>
      <section className="settings-group settings-about" aria-label="关于与版权">
        <h2 className="settings-intro">
          <span className="settings-category-icon">
            <Copyright size={17} />
          </span>
          关于与版权
        </h2>
        <div className="settings-about-content">
          <strong className="settings-about-name">DOOK</strong>
          <p>规划工作，随时小记。From DO to OK.</p>
          <p className="settings-copyright">Copyright © 2026 SEVEN-TSY</p>
          <dl className="settings-about-details">
            <div>
              <dt>源码仓库</dt>
              <dd className="settings-source-address">https://github.com/SEVEN-TSY/myTodo</dd>
            </div>
            <div>
              <dt>开源许可</dt>
              <dd>待确定，后续以源码仓库中的许可证声明为准。</dd>
            </div>
          </dl>
          <p>本应用使用的第三方开源组件，其版权归各自作者所有，并遵循各自的许可证。</p>
        </div>
      </section>
      {error && (
        <p role="alert" className="task-error">
          {error}
        </p>
      )}
    </section>
  )
}

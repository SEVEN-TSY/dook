import { useEffect, useState } from 'react'
import { Copyright } from 'lucide-react'
import type { UpdateCheckResult } from '../../../../shared/contracts'
import { Button } from '../../components/ui/button'
import { getDesktopApi, unwrap } from '../../platform/desktop'

export function AboutSettings() {
  const [version, setVersion] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<UpdateCheckResult>()
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadVersion() {
      try {
        const { runtime } = unwrap(await getDesktopApi().getBootstrap())
        setVersion(`v${runtime.appVersion}`)
      } catch {
        setVersion('版本号暂不可用')
      }
    }
    void loadVersion()
  }, [])

  async function checkForUpdates() {
    setChecking(true)
    setResult(undefined)
    setError('')
    try {
      setResult(unwrap(await getDesktopApi().checkForUpdates()))
    } catch (error) {
      setError(error instanceof Error ? error.message : '无法检查更新，请稍后重试。')
    } finally {
      setChecking(false)
    }
  }

  async function openLatestRelease() {
    setError('')
    try {
      unwrap(await getDesktopApi().openLatestRelease())
    } catch {
      setError('无法打开发布页，请稍后重试。')
    }
  }

  let status = ''
  if (checking) status = '正在检查更新…'
  else if (result?.status === 'available') status = `发现新版v${result.version}。`
  else if (result?.status === 'up-to-date') status = '当前版本已是最新。'
  else if (result?.status === 'no-release') status = '暂未发布正式版本。'

  return (
    <section className="settings-group settings-about" aria-label="关于与版权">
      <h2 className="settings-intro">
        <span className="settings-category-icon">
          <Copyright size={17} />
        </span>
        关于与版权
      </h2>
      <div className="settings-about-content">
        <div className="settings-about-release">
          <div className="settings-about-product">
            <strong className="settings-about-name">DOOK</strong>
            <span className="settings-about-version">{version}</span>
          </div>
          <Button size="sm" variant="outline" disabled={checking} onClick={checkForUpdates}>
            检查更新
          </Button>
        </div>
        <div className="settings-about-update">
          <span role="status">{error || status}</span>
          {result?.status === 'available' && (
            <Button size="sm" variant="outline" onClick={openLatestRelease}>
              打开发布页
            </Button>
          )}
        </div>
        <p>规划工作，随时小记。From DO to OK.</p>
        <p className="settings-copyright">Copyright © 2026 SEVEN-TSY</p>
        <dl className="settings-about-details">
          <div>
            <dt>源码仓库</dt>
            <dd className="settings-source-address">https://github.com/SEVEN-TSY/dook</dd>
          </div>
          <div>
            <dt>开源许可</dt>
            <dd>待确定，后续以源码仓库中的许可证声明为准。</dd>
          </div>
        </dl>
        <p>本应用使用的第三方开源组件，其版权归各自作者所有，并遵循各自的许可证。</p>
      </div>
    </section>
  )
}

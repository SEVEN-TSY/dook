import { net, shell } from 'electron'
import type { UpdateCheckResult } from '../../shared/contracts'

const repository = 'SEVEN-TSY/dook'
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export async function checkForUpdates(currentVersion: string): Promise<UpdateCheckResult> {
  let release: unknown
  try {
    const response = await net.fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000)
    })
    if (response.status === 404) return { status: 'no-release' }
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`)
    release = await response.json()
  } catch {
    throw new Error('无法检查更新，请稍后重试。')
  }

  const tag =
    release && typeof release === 'object' && 'tag_name' in release ? release.tag_name : null
  const latest = typeof tag === 'string' ? tag.replace(/^v/, '') : ''
  const current = currentVersion.split('+')[0]
  const [currentCore, prerelease] = current.split('-', 2)
  if (!versionPattern.test(latest) || !versionPattern.test(currentCore)) {
    throw new Error('无法识别版本号。')
  }

  const installed = currentCore.split('.').map(BigInt)
  const published = latest.split('.').map(BigInt)
  for (const [index, part] of published.entries()) {
    if (part > installed[index]) return { status: 'available', version: latest }
    if (part < installed[index]) return { status: 'up-to-date' }
  }
  return prerelease ? { status: 'available', version: latest } : { status: 'up-to-date' }
}

export function openLatestRelease(): Promise<void> {
  return shell.openExternal(`https://github.com/${repository}/releases/latest`)
}

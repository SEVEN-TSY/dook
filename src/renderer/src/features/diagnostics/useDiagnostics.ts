import { useCallback, useEffect, useState } from 'react'
import type { BootstrapInfo, DiagnosticReport } from '../../../../shared/contracts'
import { getDesktopApi, unwrap } from '../../platform/desktop'

export function useDiagnostics() {
  const [bootstrap, setBootstrap] = useState<BootstrapInfo | null>(null)
  const [report, setReport] = useState<DiagnosticReport | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const data = unwrap(await getDesktopApi().getBootstrap())
        if (active) setBootstrap(data)
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : '无法读取应用信息。')
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const run = useCallback(async () => {
    setRunning(true)
    setError(null)
    try {
      const data = unwrap(await getDesktopApi().runDiagnostics())
      setReport(data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '基础链路检查失败。')
    } finally {
      setRunning(false)
    }
  }, [])

  return { bootstrap, report, running, error, run }
}

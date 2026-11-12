import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { getDesktopApi, unwrap } from '../../platform/desktop'

export function DeepSeekSettings({ hidden }: { hidden: boolean }) {
  const [configured, setConfigured] = useState<boolean>()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (hidden) return
    let active = true
    async function loadStatus() {
      try {
        const configured = unwrap(await getDesktopApi().deepSeekStatus())
        if (active) setConfigured(configured)
      } catch {
        if (active) toast.error('无法读取DeepSeek配置状态。')
      }
    }
    void loadStatus()
    return () => {
      active = false
    }
  }, [hidden])

  async function run(action: 'save' | 'clear' | 'test') {
    setBusy(true)
    setMessage(action === 'test' ? '正在测试DeepSeek连接…' : '')
    try {
      const api = getDesktopApi()
      if (action === 'save') {
        unwrap(await api.saveDeepSeekKey(key))
        setConfigured(true)
        setKey('')
      } else if (action === 'clear') {
        unwrap(await api.clearDeepSeekKey())
        setConfigured(false)
      } else {
        unwrap(await api.testDeepSeekConnection())
        setMessage('DeepSeek连接成功。')
      }
    } catch (error) {
      setMessage('')
      toast.error(error instanceof Error ? error.message : 'DeepSeek操作失败。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings-group" aria-label="DeepSeek">
      <h2 className="settings-intro">
        <span className="settings-category-icon">
          <KeyRound size={17} aria-hidden="true" />
        </span>
        DeepSeek
      </h2>
      <form
        className="px-3 py-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!busy && key.trim()) void run('save')
        }}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <label htmlFor="deepseek-key">
            <strong>DeepSeek API Key</strong>
          </label>
          <span className="text-sm text-muted-foreground" role="status">
            {configured === undefined ? '' : configured ? '已配置' : '未配置'}
          </span>
          <p id="deepseek-key-help" className="basis-full text-sm text-muted-foreground">
            {
              'API Key加密保存在本机，DOOK直接连接DeepSeek。测试连接使用已保存的Key，不发送任务内容，可能产生少量API费用。'
            }
          </p>
        </div>
        <Input
          id="deepseek-key"
          aria-describedby="deepseek-key-help"
          type="password"
          autoComplete="off"
          spellCheck={false}
          className="mt-3 max-w-sm"
          value={key}
          disabled={busy}
          onChange={(event) => setKey(event.target.value)}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" type="submit" disabled={busy || !key.trim()}>
            {configured ? '替换Key' : '保存Key'}
          </Button>
          <Button
            size="sm"
            type="button"
            variant="outline"
            disabled={busy || !configured}
            onClick={() => void run('test')}
          >
            测试连接
          </Button>
          <Button
            size="sm"
            type="button"
            variant="ghost"
            disabled={busy || !configured}
            onClick={() => void run('clear')}
          >
            清除Key
          </Button>
        </div>
        <p role="status" className="mt-2 text-sm text-muted-foreground empty:hidden">
          {message}
        </p>
      </form>
    </section>
  )
}

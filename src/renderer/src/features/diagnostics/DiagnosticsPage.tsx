import { version as reactVersion } from 'react'
import { Icon } from '../../components/Icon'
import { StatusBadge } from '../../components/StatusBadge'
import { useDiagnostics } from './useDiagnostics'

export function DiagnosticsPage() {
  const { bootstrap, report, running, error, run } = useDiagnostics()
  const sqlite = report?.checks.find((check) => check.id === 'sqlite')
  const mcp = report?.checks.find((check) => check.id === 'mcp')
  const passed = report?.checks.filter((check) => check.ok).length ?? 0
  const checkedAt = report
    ? new Intl.DateTimeFormat('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(new Date(report.checkedAt))
    : null

  return (
    <main className="workspace">
      <div className="breadcrumb">
        <span>工作空间</span>
        <span>/</span>
        <strong>工程验证</strong>
        <span className="environment">LOCAL DEVELOPMENT</span>
      </div>
      <header className="page-header">
        <div>
          <div className="eyebrow">FOUNDATION / 01</div>
          <h1>从这里，开始构建。</h1>
          <p>myTodo的工程底座已就绪。先验证连接，再逐步实现你的想法。</p>
        </div>
        <StatusBadge state={bootstrap ? 'success' : error ? 'error' : 'pending'}>
          {bootstrap ? '桌面环境已连接' : error ? '连接不可用' : '正在连接'}
        </StatusBadge>
      </header>

      {error && (
        <div role="alert" className="error-banner">
          {error}
        </div>
      )}

      <section className="stack-grid" aria-label="技术栈状态">
        <article className="stack-card">
          <div className="stack-icon violet">
            <Icon name="grid" />
          </div>
          <span className="stack-label">桌面容器</span>
          <h2>
            Electron<span>{bootstrap?.runtime.electron ?? '—'}</span>
          </h2>
          <p>Node.js {bootstrap?.runtime.node ?? '待连接'}</p>
          <div className="card-state">
            <i className={bootstrap ? 'green-dot' : 'gray-dot'} />
            {bootstrap ? '主进程已就绪' : '等待主进程'}
          </div>
        </article>
        <article className="stack-card">
          <div className="stack-icon blue">
            <Icon name="code" />
          </div>
          <span className="stack-label">用户界面</span>
          <h2>
            React<span>{reactVersion}</span>
          </h2>
          <p>TypeScript / Vite</p>
          <div className="card-state">
            <i className="green-dot" />
            渲染进程已就绪
          </div>
        </article>
        <article className="stack-card">
          <div className="stack-icon amber">
            <Icon name="database" />
          </div>
          <span className="stack-label">本地存储</span>
          <h2>
            SQLite<span>LOCAL</span>
          </h2>
          <p>内置驱动 / SQL迁移</p>
          <div className="card-state">
            <i className={sqlite ? (sqlite.ok ? 'green-dot' : 'red-dot') : 'gray-dot'} />
            {sqlite ? (sqlite.ok ? '真实读写已通过' : '读写检查失败') : '等待读写检查'}
          </div>
        </article>
        <article className="stack-card">
          <div className="stack-icon mint">
            <Icon name="link" />
          </div>
          <span className="stack-label">Agent接入</span>
          <h2>
            MCP<span>HTTP</span>
          </h2>
          <p>官方TypeScript SDK</p>
          <div className="card-state">
            <i
              className={
                mcp
                  ? mcp.ok
                    ? 'green-dot'
                    : 'red-dot'
                  : bootstrap?.mcp.state === 'listening'
                    ? 'green-dot'
                    : 'gray-dot'
              }
            />
            {mcp
              ? mcp.ok
                ? '工具调用已通过'
                : '工具调用失败'
              : bootstrap?.mcp.state === 'listening'
                ? '本机端点已监听'
                : '等待端点启动'}
          </div>
        </article>
      </section>

      <section className="panel verification-panel">
        <div className="panel-header">
          <div>
            <h2>
              <Icon name="terminal" />
              基础链路检查
            </h2>
            <p>一次验证界面、主进程、数据库和Agent接口的实际连接。</p>
          </div>
          <button
            className="primary-button"
            onClick={() => void run()}
            disabled={running || !bootstrap}
            data-testid="run-diagnostics"
          >
            {running ? <span className="spinner" /> : <Icon name="play" size={15} />}
            {running ? '检查中…' : report ? '重新检查' : '运行检查'}
          </button>
        </div>
        <div className="check-list" aria-live="polite" aria-busy={running}>
          {[
            { id: 'ipc', title: '进程通信', path: 'React → preload → Electron IPC' },
            { id: 'sqlite', title: '数据库读写', path: 'AppService → SQLite临时表 → 回滚清理' },
            {
              id: 'mcp',
              title: 'MCP工具调用',
              path: 'SDK Client → HTTP → app_diagnostics → AppService'
            }
          ].map((item, index) => {
            const check = report?.checks.find((result) => result.id === item.id)
            return (
              <div
                className="check-row"
                key={item.id}
                data-check={item.id}
                data-result={check ? (check.ok ? 'passed' : 'failed') : 'pending'}
              >
                <div className={`step-number ${check?.ok ? 'checked' : ''}`}>
                  {check?.ok ? <Icon name="check" size={15} /> : `0${index + 1}`}
                </div>
                <div className="check-content">
                  <h3>{item.title}</h3>
                  <p>{check?.detail ?? item.path}</p>
                </div>
                <span className="check-time">{check ? `${check.durationMs}ms` : '—'}</span>
                <StatusBadge
                  state={running ? 'pending' : check ? (check.ok ? 'success' : 'error') : 'pending'}
                >
                  {running ? '检查中' : check ? (check.ok ? '通过' : '失败') : '待检查'}
                </StatusBadge>
              </div>
            )
          })}
        </div>
        <div className="panel-footer">
          <span>
            <i className={report && passed === 3 ? 'green-dot' : 'gray-dot'} />
            {report
              ? `${passed}/3项通过 · 最近检查 ${checkedAt}`
              : '尚未运行 · 点击右上方按钮开始验证'}
          </span>
          <span>诊断数据自动清理</span>
        </div>
      </section>

      <section className="bottom-grid">
        <article className="panel architecture-panel">
          <div className="section-heading">
            <h2>一套核心，两个入口</h2>
            <span className="small-label">ARCHITECTURE</span>
          </div>
          <p className="section-description">界面与Agent共用业务入口和数据库连接。</p>
          <div className="architecture-flow">
            <div className="flow-entry">
              <span>React界面</span>
              <small>preload / IPC</small>
            </div>
            <div className="flow-entry">
              <span>Agent</span>
              <small>MCP / HTTP</small>
            </div>
            <div className="flow-arrow">
              <Icon name="arrow" size={18} />
            </div>
            <div className="flow-core">
              <Icon name="code" size={19} />
              <span>AppService</span>
              <small>共享应用核心</small>
            </div>
            <div className="flow-arrow">
              <Icon name="arrow" size={18} />
            </div>
            <div className="flow-storage">
              <Icon name="database" size={22} />
              <span>SQLite</span>
            </div>
          </div>
          <div className="architecture-note">Electron主进程持有本地服务，无需额外常驻后端。</div>
        </article>
        <article className="panel runtime-panel">
          <div className="section-heading">
            <h2>运行信息</h2>
            <Icon name="folder" size={18} />
          </div>
          <dl>
            <div>
              <dt>应用版本</dt>
              <dd>
                {bootstrap ? `v${bootstrap.runtime.appVersion}` : '—'}
                <span className="inline-label">
                  {bootstrap?.runtime.isPackaged ? '安装版' : '开发版'}
                </span>
              </dd>
            </div>
            <div>
              <dt>运行平台</dt>
              <dd>{bootstrap?.runtime.platform ?? '—'}</dd>
            </div>
            <div className="long-value">
              <dt>MCP端点</dt>
              <dd title={bootstrap?.mcp.error ?? undefined}>
                {bootstrap?.mcp.endpoint ?? bootstrap?.mcp.error ?? '等待连接'}
              </dd>
            </div>
            <div className="long-value">
              <dt>数据目录</dt>
              <dd title={bootstrap?.runtime.dataDirectory}>
                {bootstrap?.runtime.dataDirectory ?? '等待连接'}
              </dd>
            </div>
          </dl>
        </article>
      </section>
      <footer className="page-footer">
        <span>基础设施验证页 · 当前尚未实现业务功能</span>
        <span>Electron + React + TypeScript + SQLite</span>
      </footer>
    </main>
  )
}

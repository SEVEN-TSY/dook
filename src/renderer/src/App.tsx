import { DiagnosticsPage } from './features/diagnostics/DiagnosticsPage'
import { Icon } from './components/Icon'

export function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Icon name="check" size={23} />
          </div>
          <div>
            myTodo<small>留一点空间，给想法。</small>
          </div>
        </div>
        <div className="sidebar-label">工作空间</div>
        <nav aria-label="应用导航">
          <div className="nav-item active" aria-current="page">
            <Icon name="grid" size={18} />
            <span>工程验证</span>
            <i />
          </div>
        </nav>
        <div className="sidebar-label planned-label">
          后续模块<span>待实现</span>
        </div>
        <div className="planned-nav" aria-label="尚未实现的模块">
          <div className="nav-item">
            <Icon name="check" size={18} />
            <span>任务</span>
          </div>
          <div className="nav-item">
            <Icon name="circle" size={18} />
            <span>习惯</span>
          </div>
          <div className="nav-item">
            <Icon name="spark" size={18} />
            <span>灵感</span>
          </div>
          <div className="nav-item">
            <Icon name="settings" size={18} />
            <span>设置</span>
          </div>
        </div>
        <div className="sidebar-bottom">
          <div className="scaffold-label">
            <span className="green-dot" />
            工程骨架
          </div>
          <p>
            把连接打通。
            <br />
            让功能自然生长。
          </p>
          <div className="sidebar-version">
            myTodo<span>v0.1.0</span>
          </div>
        </div>
      </aside>
      <DiagnosticsPage />
    </div>
  )
}

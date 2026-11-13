import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { preloadMainFeatures } from './features/main-features'
import { preloadTaskMenu } from './features/tasks/task-menu-loader'
import './styles/shared.css'
import './styles/global.css'
import './styles/shadcn.css'

const kind = new URLSearchParams(window.location.search).get('window') === 'note' ? 'note' : 'main'
// 主界面布局样式、隐藏页和任务菜单只在主窗口加载；桌面便签启动不需要这些chunk。
if (kind === 'main')
  await Promise.all([import('./styles/workbench.css'), preloadMainFeatures(), preloadTaskMenu()])

const scheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
document.documentElement.dataset.theme = scheme
document.documentElement.classList.toggle('dark', scheme === 'dark')
document.documentElement.style.colorScheme = scheme
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

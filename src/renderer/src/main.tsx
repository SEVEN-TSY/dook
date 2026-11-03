import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/shared.css'
import './styles/global.css'
import './styles/workbench.css'
import './styles/shadcn.css'

const scheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
document.documentElement.dataset.theme = scheme
document.documentElement.classList.toggle('dark', scheme === 'dark')
document.documentElement.style.colorScheme = scheme
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

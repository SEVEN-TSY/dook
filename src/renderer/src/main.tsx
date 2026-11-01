import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/global.css'

const prototype =
  import.meta.env.DEV && new URLSearchParams(location.search).get('prototype') === 'inspiration'
const Root = prototype
  ? (await import('./features/inspirations/InspirationPrototype')).InspirationPrototype
  : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
)

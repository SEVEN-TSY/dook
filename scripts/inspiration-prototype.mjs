// Throwaway renderer preview; no Electron bridge or database is started.
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const server = await createServer({
  configFile: false,
  root: 'src/renderer',
  plugins: [
    react(),
    {
      name: 'prototype-csp',
      transformIndexHtml: (html) =>
        html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
    }
  ],
  server: { host: '127.0.0.1', port: 5198, strictPort: true },
  open: '/?prototype=inspiration&variant=A'
})
await server.listen()
console.log('灵感原型：http://127.0.0.1:5198/?prototype=inspiration&variant=A')

import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    build: { rollupOptions: { input: resolve('src/main/index.ts') } }
  },
  preload: {
    build: {
      rollupOptions: {
        input: resolve('src/preload/index.ts'),
        output: { format: 'cjs', entryFileNames: 'index.cjs' }
      }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: { alias: { '@': resolve('src/renderer/src') } },
    plugins: [
      tailwindcss(),
      react(),
      {
        name: 'development-csp',
        transformIndexHtml(html, context) {
          // React Fast Refresh需要开发期内联前导脚本，生产构建保持严格CSP。
          return context.server
            ? html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
            : html
        }
      }
    ],
    build: { minify: true, rollupOptions: { input: resolve('src/renderer/index.html') } }
  }
})

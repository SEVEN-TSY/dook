import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runner = resolve(root, '.local/smoke/runner')
const metadata = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
mkdirSync(runner, { recursive: true })
// 用真实应用元信息启动，避免单脚本模式将Electron版本误报为应用版本。
writeFileSync(
  resolve(runner, 'package.json'),
  JSON.stringify({
    name: metadata.name,
    version: metadata.version,
    type: 'module',
    main: resolve(root, 'scripts/electron-smoke.mjs')
  })
)
const env = { ...process.env }
// 某些终端会设置此变量；桌面验证需要以Electron模式启动。
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(electron, [runner], {
  cwd: root,
  env,
  windowsHide: true,
  stdio: 'inherit'
})
const timeout = setTimeout(() => {
  child.kill()
  process.exitCode = 1
}, 30_000)
child.on('error', (error) => {
  clearTimeout(timeout)
  console.error(error)
  process.exitCode = 1
})
child.on('exit', (code) => {
  clearTimeout(timeout)
  process.exitCode = code ?? 1
})

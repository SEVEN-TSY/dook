import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runner = resolve(root, '.local/smoke/runner')
const metadata = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
mkdirSync(runner, { recursive: true })
writeFileSync(
  resolve(runner, 'package.json'),
  JSON.stringify({
    name: metadata.name,
    version: metadata.version,
    type: 'module',
    main: resolve(root, 'scripts/electron-smoke.mjs')
  })
)
const env = { ...process.env, MYTODO_SMOKE_DATA: mkdtempSync(resolve(root, '.local/smoke/data-')) }
delete env.ELECTRON_RUN_AS_NODE
const phases =
  process.argv[2] === 'task-inline'
    ? ['task-inline-create', 'task-inline-restart']
    : [
          'toast',
          'window-controls',
          'list-metadata',
          'habit-archive',
          'drag',
          'dock',
          'note-convert',
          'lifecycle',
          'workbench',
          'list-interaction',
          'main-overview',
          'delete-confirmation'
        ].includes(process.argv[2])
      ? [process.argv[2]]
      : process.argv[2] === 'note-jottings'
        ? ['note-jottings-create', 'note-jottings-restart']
        : process.argv[2] === 'appearance'
          ? ['appearance-create', 'appearance-restart']
          : process.argv[2] === 'topic-refinement'
            ? ['topic-refinement-create', 'topic-refinement-restart']
            : process.argv[2] === 'inspiration-page'
              ? ['inspiration-page-create', 'inspiration-page-restart']
              : process.argv[2] === 'note-archive'
                ? ['note-archive-create', 'note-archive-restart']
                : process.argv[2] === 'topic-management'
                  ? ['topic-management-create', 'topic-management-restart']
                  : process.argv[2] === 'topics'
                    ? ['topics-create', 'topics-restart']
                    : process.argv[2] === 'order'
                      ? ['order-create', 'order-restart']
                      : process.argv[2] === 'multiday'
                        ? ['multiday-create', 'multiday-restart']
                        : process.argv[2] === 'subitems'
                          ? ['subitems-create', 'subitems-restart']
                          : ['create', 'restart']
for (const phase of phases) {
  const code = await new Promise((resolveExit, reject) => {
    const child = spawn(electron, [runner], {
      cwd: root,
      env: { ...env, MYTODO_SMOKE_PHASE: phase },
      // Electron是GUI进程；SW_HIDE会吞掉首个窗口的show，无法验收真实可见性。
      windowsHide: false,
      stdio: 'inherit'
    })
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error(`Electron smoke超时：${phase}`))
    }, 55_000)
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('exit', (code) => {
      clearTimeout(timeout)
      resolveExit(code ?? 1)
    })
  })
  if (code !== 0) {
    process.exitCode = code
    break
  }
}

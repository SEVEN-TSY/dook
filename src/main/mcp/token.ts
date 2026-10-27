import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** 本地凭证只存于用户数据目录，不返回渲染进程，不写日志。 */
export function loadOrCreateToken(path: string): string {
  mkdirSync(dirname(path), { recursive: true })
  try {
    writeFileSync(path, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  const token = readFileSync(path, 'utf8').trim()
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('本地MCP凭证文件格式不正确。')
  return token
}

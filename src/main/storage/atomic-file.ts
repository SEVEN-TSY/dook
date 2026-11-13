import { renameSync, rmSync, writeFileSync } from 'node:fs'

export function writeAtomic(path: string, data: Buffer | string) {
  const temporary = `${path}.tmp`
  try {
    writeFileSync(temporary, data, { mode: 0o600 })
    renameSync(temporary, path)
  } catch (error) {
    try {
      rmSync(temporary, { force: true })
    } catch {
      // Preserve the original write error if cleanup also fails.
    }
    throw error
  }
}

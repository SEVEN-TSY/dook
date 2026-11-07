import { copyFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'

/** 启动时在单实例锁内复制旧数据。数据库最后就位，以便中断后重试。 */
export async function prepareDataDirectory(
  directory: string,
  previousDirectory: string
): Promise<string> {
  const databasePath = join(directory, 'dook.sqlite')
  if (statSync(databasePath, { throwIfNoEntry: false })) return databasePath

  const previousDatabase = join(previousDirectory, 'mytodo.sqlite')
  const hasPreviousDatabase = statSync(previousDatabase, { throwIfNoEntry: false })
  const settings = ['desktop-settings.json', 'mcp-token'].filter(
    (file) =>
      !statSync(join(directory, file), { throwIfNoEntry: false }) &&
      statSync(join(previousDirectory, file), { throwIfNoEntry: false })
  )
  if (!hasPreviousDatabase && settings.length === 0) return databasePath

  mkdirSync(directory, { recursive: true })
  const staging = mkdtempSync(join(directory, '.dook-migration-'))
  try {
    const stagedDatabase = join(staging, 'dook.sqlite')
    if (hasPreviousDatabase) {
      const source = new DatabaseSync(previousDatabase, { readOnly: true })
      try {
        await backup(source, stagedDatabase)
      } finally {
        source.close()
      }
    }
    for (const file of settings) {
      const stagedFile = join(staging, file)
      copyFileSync(join(previousDirectory, file), stagedFile)
      renameSync(stagedFile, join(directory, file))
    }
    if (hasPreviousDatabase) renameSync(stagedDatabase, databasePath)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
  return databasePath
}

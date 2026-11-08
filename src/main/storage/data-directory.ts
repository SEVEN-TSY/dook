import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync
} from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'

export function readInstalledDataDirectory(installDirectory: string): string | undefined {
  try {
    const location = readFileSync(
      join(installDirectory, 'dook-data-location.txt'),
      'utf16le'
    ).trim()
    return isAbsolute(location) ? location : undefined
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

export function findMigrationFile(name: string, directories: string[]): string | undefined {
  return directories
    .map((directory) => join(directory, name))
    .find((path) => statSync(path, { throwIfNoEntry: false })?.isFile())
}

/** 启动时在单实例锁内复制旧数据。数据库最后就位，以便中断后重试。 */
export async function prepareDataDirectory(
  directory: string,
  previousDirectory: string,
  formerDirectory?: string
): Promise<string> {
  const databasePath = join(directory, 'dook.sqlite')
  if (statSync(databasePath, { throwIfNoEntry: false })) return databasePath

  const previousDatabase =
    (formerDirectory && findMigrationFile('dook.sqlite', [formerDirectory])) ||
    findMigrationFile('mytodo.sqlite', [previousDirectory])
  const sources = formerDirectory ? [formerDirectory, previousDirectory] : [previousDirectory]
  const settings = ['desktop-settings.json', 'note-position.json', 'mcp-token'].flatMap((file) => {
    if (statSync(join(directory, file), { throwIfNoEntry: false })) return []
    const source = findMigrationFile(file, sources)
    return source ? [{ file, source }] : []
  })
  if (!previousDatabase && settings.length === 0) return databasePath

  mkdirSync(directory, { recursive: true })
  const staging = mkdtempSync(join(directory, '.dook-migration-'))
  try {
    const stagedDatabase = join(staging, 'dook.sqlite')
    if (previousDatabase) {
      const source = new DatabaseSync(previousDatabase, { readOnly: true })
      try {
        await backup(source, stagedDatabase)
      } finally {
        source.close()
      }
    }
    for (const { file, source } of settings) {
      const stagedFile = join(staging, file)
      copyFileSync(source, stagedFile)
      renameSync(stagedFile, join(directory, file))
    }
    if (previousDatabase) renameSync(stagedDatabase, databasePath)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
  return databasePath
}

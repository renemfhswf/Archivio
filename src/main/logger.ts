import { app } from 'electron'
import { appendFile, mkdir, rename, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

let logFile: string | null = null
let rotationChecked = false

export function getLogFile(): string {
  if (!logFile) {
    logFile = join(app.getPath('userData'), 'archivio.log')
  }
  return logFile
}

async function rotateIfNeeded(): Promise<void> {
  if (rotationChecked) return
  rotationChecked = true
  try {
    const info = await stat(getLogFile())
    if (info.size > 2 * 1024 * 1024) {
      await rename(getLogFile(), `${getLogFile()}.1`)
    }
  } catch {
    // Logdatei existiert noch nicht.
  }
}

export async function log(
  level: 'info' | 'warn' | 'error',
  message: string,
  error?: unknown
): Promise<void> {
  try {
    await mkdir(dirname(getLogFile()), { recursive: true })
    await rotateIfNeeded()
    const detail =
      error instanceof Error
        ? ` | ${error.name}: ${error.message}`
        : error !== undefined
          ? ` | ${String(error)}`
          : ''
    const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}${detail}\n`
    await appendFile(getLogFile(), line, 'utf8')
  } catch {
    // Logging darf die Anwendung niemals zum Absturz bringen.
  }
}

export function logError(context: string, error: unknown): void {
  void log('error', context, error)
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Unbekannter Fehler'
}

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { DEFAULT_SETTINGS } from '../shared/constants'
import type {
  AppSettings,
  ConflictDecision,
  CopyRequest,
  DuplicateActionRequest,
  DuplicateExportRequest,
  DuplicateScanOptions,
  QueueJob
} from '../shared/types'
import { CopyService } from './copy-service'
import { DuplicateService } from './duplicate-service'
import { getFreeSpace, getPreview, listDirectory } from './file-service'
import { HashCache } from './hash'
import { HistoryStore } from './history'
import { errorMessage, getLogFile, logError } from './logger'
import { assertAbsolutePath, getSystemRoots } from './paths'
import { SettingsStore } from './settings'

type Handler = (...args: any[]) => unknown

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} fehlt.`)
  }
  return value
}

function asStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} muss eine Liste sein.`)
  return value.filter((entry): entry is string => typeof entry === 'string')
}

function asNumber(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : fallback
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asDecision(value: unknown, fallback: ConflictDecision): ConflictDecision {
  return value === 'skip' || value === 'replace' || value === 'rename'
    ? value
    : fallback
}

function sendToWindow(
  getWindow: () => BrowserWindow | null,
  channel: string,
  payload: unknown
): void {
  const window = getWindow()
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, payload)
  }
}

export async function registerIpcHandlers(
  getWindow: () => BrowserWindow | null
): Promise<{
  settings: SettingsStore
  copy: CopyService
  duplicates: DuplicateService
}> {
  const settings = new SettingsStore()
  await settings.load()
  const history = new HistoryStore()
  await history.load()
  const hashCache = new HashCache()

  const copy = new CopyService((progress) => {
    sendToWindow(getWindow, 'copy:progress', progress)
  }, hashCache)

  const loggedScans = new Set<string>()
  let duplicates: DuplicateService
  duplicates = new DuplicateService((progress) => {
    sendToWindow(getWindow, 'duplicate:progress', progress)
    if (
      ['done', 'cancelled', 'error'].includes(progress.phase) &&
      !loggedScans.has(progress.scanId)
    ) {
      loggedScans.add(progress.scanId)
      const report = duplicates.getReport(progress.scanId)
      if (report) {
        void history.add({
          type: 'scan',
          title: 'Duplikatsuche',
          detail: `${report.roots.length} Ordner durchsucht, ${report.groups.length} Gruppen gefunden`,
          count: report.groups.length,
          bytes: report.wastedBytes,
          errors: report.errors.length
        })
      }
    }
  }, hashCache)

  const handle = (channel: string, handler: Handler): void => {
    ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
      try {
        return await handler(...args)
      } catch (error) {
        logError(channel, error)
        throw new Error(errorMessage(error))
      }
    })
  }

  handle('app:info', () => {
    const current = settings.get()
    return {
      version: app.getVersion(),
      platform: process.platform,
      dataDir: app.getPath('userData'),
      logFile: getLogFile(),
      quarantineDefault: current.archiveRoots[0]
        ? join(current.archiveRoots[0], '_Archivio-Duplikate')
        : null
    }
  })

  handle('fs:roots', () => getSystemRoots())

  handle('fs:list', async (path) => {
    return listDirectory(assertAbsolutePath(path, 'Ordnerpfad'))
  })

  handle('fs:freeSpace', async (path) => {
    return getFreeSpace(assertAbsolutePath(path, 'Pfad'))
  })

  handle('dialog:chooseDirectory', async (options) => {
    const typed = (options ?? {}) as {
      title?: unknown
      defaultPath?: unknown
    }
    const result = await dialog.showOpenDialog({
      title:
        typeof typed.title === 'string' ? typed.title : 'Ordner auswählen',
      defaultPath:
        typeof typed.defaultPath === 'string' ? typed.defaultPath : undefined,
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0] ?? null
  })

  handle('dialog:chooseDirectories', async (options) => {
    const typed = (options ?? {}) as {
      title?: unknown
      defaultPath?: unknown
    }
    const result = await dialog.showOpenDialog({
      title:
        typeof typed.title === 'string'
          ? typed.title
          : 'Ordner auswählen',
      defaultPath:
        typeof typed.defaultPath === 'string' ? typed.defaultPath : undefined,
      properties: ['openDirectory', 'createDirectory', 'multiSelections']
    })
    return result.canceled ? [] : result.filePaths
  })

  handle('settings:get', () => settings.get())

  handle('settings:update', async (patch) => {
    if (!patch || typeof patch !== 'object') {
      throw new Error('Ungültige Einstellungen.')
    }
    return settings.update(patch as Partial<AppSettings>)
  })

  handle('preview:get', async (path) => {
    return getPreview(
      assertAbsolutePath(path, 'Dateipfad'),
      settings.previewLimit
    )
  })

  handle('copy:plan', async (jobs) => {
    if (!Array.isArray(jobs)) throw new Error('Ungültige Dateiliste.')
    const typed: QueueJob[] = jobs.map((job) => {
      const entry = (job ?? {}) as Record<string, unknown>
      return {
        id: asString(entry.id, 'Auftrags-ID'),
        sourcePath: asString(entry.sourcePath, 'Quelldatei'),
        targetDir: asString(entry.targetDir, 'Zielordner')
      }
    })
    return copy.plan(typed)
  })

  handle('copy:start', async (request) => {
    if (!request || typeof request !== 'object') {
      throw new Error('Ungültiger Kopierauftrag.')
    }
    const typed = request as Partial<CopyRequest>
    const planId = asString(typed.planId, 'Kopierplan')
    const decisions =
      typed.decisions && typeof typed.decisions === 'object'
        ? Object.fromEntries(
            Object.entries(typed.decisions).map(([key, value]) => [
              key,
              asDecision(value, 'skip')
            ])
          )
        : {}
    const summary = await copy.start({
      planId,
      decisions,
      defaultDecision: asDecision(typed.defaultDecision, 'skip'),
      verify: asBoolean(typed.verify, DEFAULT_SETTINGS.verifyAfterCopy),
      preserveTimestamps: asBoolean(
        typed.preserveTimestamps,
        DEFAULT_SETTINGS.preserveTimestamps
      ),
      concurrency: Math.min(
        6,
        Math.max(1, asNumber(typed.concurrency, DEFAULT_SETTINGS.copyConcurrency))
      )
    })
    void history.add({
      type: 'copy',
      title: summary.cancelled ? 'Kopieren abgebrochen' : 'Dateien kopiert',
      detail: `${summary.copied} kopiert, ${summary.skipped} übersprungen, ${summary.failed} Fehler`,
      count: summary.copied,
      bytes: summary.bytes,
      errors: summary.errors.length
    })
    return summary
  })

  handle('copy:cancel', (batchId) => {
    copy.cancel(asString(batchId, 'Batch-ID'))
  })

  handle('duplicates:start', (options) => {
    if (!options || typeof options !== 'object') {
      throw new Error('Ungültige Suchoptionen.')
    }
    const typed = options as Partial<DuplicateScanOptions>
    return duplicates.start({
      roots: asStringArray(typed.roots, 'Suchordner'),
      minSize: Math.max(0, asNumber(typed.minSize, 1)),
      includeHidden: asBoolean(typed.includeHidden, false),
      excludeNames: asStringArray(
        typed.excludeNames,
        'Ausschlussliste'
      )
    })
  })

  handle('duplicates:cancel', (scanId) => {
    duplicates.cancel(asString(scanId, 'Scan-ID'))
  })

  handle('duplicates:get', (scanId) => {
    return duplicates.getReport(asString(scanId, 'Scan-ID'))
  })

  handle('duplicates:action', async (request) => {
    if (!request || typeof request !== 'object') {
      throw new Error('Ungültige Aktion.')
    }
    const typed = request as Partial<DuplicateActionRequest>
    const disposition =
      typed.disposition === 'quarantine' ||
      typed.disposition === 'trash' ||
      typed.disposition === 'delete'
        ? typed.disposition
        : null
    if (!disposition) throw new Error('Unbekannte Aktion.')
    const result = await duplicates.applyAction({
      scanId: asString(typed.scanId, 'Scan-ID'),
      disposition,
      filePaths: asStringArray(typed.filePaths, 'Dateiliste'),
      quarantineDir:
        typeof typed.quarantineDir === 'string'
          ? typed.quarantineDir
          : null,
      confirmToken:
        typeof typed.confirmToken === 'string' ? typed.confirmToken : null
    })
    const titles = {
      quarantine: 'Duplikate in Quarantäne verschoben',
      trash: 'Duplikate in den Papierkorb verschoben',
      delete: 'Duplikate endgültig gelöscht'
    } as const
    void history.add({
      type: disposition,
      title: titles[disposition],
      detail: `${result.removed} Dateien, ${result.errors.length} Fehler`,
      count: result.removed,
      bytes: result.bytesFreed,
      errors: result.errors.length
    })
    return result
  })

  handle('duplicates:export', (request) => {
    if (!request || typeof request !== 'object') {
      throw new Error('Ungültiger Export.')
    }
    const typed = request as Partial<DuplicateExportRequest>
    return duplicates.exportReport({
      scanId: asString(typed.scanId, 'Scan-ID'),
      format: typed.format === 'json' ? 'json' : 'csv'
    })
  })

  handle('history:get', () => history.list())

  handle('history:clear', async () => {
    await history.clear()
  })

  handle('shell:reveal', (path) => {
    shell.showItemInFolder(assertAbsolutePath(path, 'Pfad'))
  })

  handle('shell:open', async (path) => {
    const message = await shell.openPath(
      assertAbsolutePath(path, 'Pfad')
    )
    if (message) throw new Error(message)
  })

  return { settings, copy, duplicates }
}

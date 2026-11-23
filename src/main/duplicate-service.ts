import { app, dialog, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import {
  lstat,
  mkdir,
  opendir,
  rename,
  rm,
  unlink,
  writeFile
} from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { HASH_CONCURRENCY } from '../shared/constants'
import { toCsv } from '../shared/csv'
import {
  buildDuplicateGroups,
  recomputeReportTotals,
  suggestedKeeper
} from '../shared/duplicates'
import { sanitizeFileName } from '../shared/naming'
import type {
  DuplicateActionRequest,
  DuplicateActionResult,
  DuplicateExportRequest,
  DuplicateFile,
  DuplicateGroup,
  DuplicateReport,
  DuplicateScanOptions,
  DuplicateScanProgress
} from '../shared/types'
import { availableName, copyFileSafe } from './copy-service'
import {
  abortError,
  HashCache,
  isAbortError,
  mapLimit
} from './hash'
import {
  assertAbsolutePath,
  pathKey,
  relativeToRoot,
  rootLabel
} from './paths'

const MAX_REPORTS = 5
const MAX_ERRORS = 100

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unbekannter Fehler'
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const path of paths) {
    const key = pathKey(path)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(path)
  }
  return result
}

async function moveFile(
  source: string,
  target: string,
  signal: AbortSignal
): Promise<void> {
  try {
    await rename(source, target)
    return
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
  }
  await mkdir(dirname(target), { recursive: true })
  await copyFileSafe(source, target, {
    verify: true,
    preserveTimestamps: true,
    replaceExisting: false,
    signal
  })
  await unlink(source)
}

export class DuplicateService {
  private readonly reports = new Map<string, DuplicateReport>()
  private readonly scans = new Map<string, AbortController>()

  constructor(
    private readonly emitProgress: (progress: DuplicateScanProgress) => void,
    private readonly hashCache: HashCache
  ) {}

  start(options: DuplicateScanOptions): string {
    const roots = uniquePaths(
      (Array.isArray(options.roots) ? options.roots : [])
        .map((root) => assertAbsolutePath(root, 'Suchordner'))
        .filter((root) => root.length > 0)
    )
    if (roots.length === 0) {
      throw new Error('Bitte mindestens einen Ordner für die Suche auswählen.')
    }
    const excludeNames = new Set(
      (options.excludeNames ?? [])
        .filter((name): name is string => typeof name === 'string')
        .map((name) => name.toLocaleLowerCase('de-DE'))
    )
    const minSize = Math.max(0, Number(options.minSize) || 0)
    const includeHidden = Boolean(options.includeHidden)

    const scanId = randomUUID()
    const controller = new AbortController()
    this.scans.set(scanId, controller)

    const report: DuplicateReport = {
      id: scanId,
      startedAt: Date.now(),
      finishedAt: null,
      roots,
      groups: [],
      scannedFiles: 0,
      candidateFiles: 0,
      totalBytes: 0,
      wastedBytes: 0,
      errors: [],
      phase: 'walking'
    }
    this.reports.set(scanId, report)
    this.pruneReports()

    void this.run(
      report,
      { roots, minSize, includeHidden, excludeNames },
      controller.signal
    )
    return scanId
  }

  cancel(scanId: string): void {
    this.scans.get(scanId)?.abort()
  }

  cancelAll(): void {
    for (const controller of this.scans.values()) {
      controller.abort()
    }
  }

  getReport(scanId: string): DuplicateReport | null {
    return this.reports.get(scanId) ?? null
  }

  async applyAction(
    request: DuplicateActionRequest
  ): Promise<DuplicateActionResult> {
    const report = this.reports.get(request.scanId)
    if (!report) throw new Error('Der Suchbericht ist nicht mehr verfügbar.')
    if (!['quarantine', 'trash', 'delete'].includes(request.disposition)) {
      throw new Error('Unbekannte Aktion.')
    }
    if (
      request.disposition === 'delete' &&
      request.confirmToken !== 'LÖSCHEN'
    ) {
      throw new Error(
        'Zum endgültigen Löschen muss die Bestätigung „LÖSCHEN“ eingegeben werden.'
      )
    }

    const paths = uniquePaths(
      (Array.isArray(request.filePaths) ? request.filePaths : []).filter(
        (path): path is string => typeof path === 'string'
      )
    )
    if (paths.length === 0) {
      throw new Error('Es wurden keine Dateien ausgewählt.')
    }

    const groupByPath = new Map<string, DuplicateGroup>()
    for (const group of report.groups) {
      for (const file of group.files) {
        groupByPath.set(pathKey(file.path), group)
      }
    }

    const removalsPerGroup = new Map<string, number>()
    for (const path of paths) {
      const group = groupByPath.get(pathKey(path))
      if (!group) {
        throw new Error(
          `Die Datei gehört nicht zum aktuellen Bericht: ${path}`
        )
      }
      const count = (removalsPerGroup.get(group.id) ?? 0) + 1
      removalsPerGroup.set(group.id, count)
      if (count >= group.files.length) {
        throw new Error(
          'Pro Duplikatgruppe muss mindestens eine Datei erhalten bleiben.'
        )
      }
    }

    let quarantineDir: string | null = null
    if (request.disposition === 'quarantine') {
      quarantineDir = assertAbsolutePath(
        request.quarantineDir,
        'Quarantäneordner'
      )
      await mkdir(quarantineDir, { recursive: true })
    }

    const removed = new Set<string>()
    const errors: string[] = []
    let bytesFreed = 0

    for (const path of paths) {
      try {
        const info = await lstat(path)
        if (!info.isFile()) {
          errors.push(`${path}: keine reguläre Datei mehr.`)
          continue
        }

        if (request.disposition === 'quarantine' && quarantineDir) {
          const location = relativeToRoot(path, report.roots)
          const relativePath = location
            ? location.relativePath
            : basename(path)
          const label = location
            ? sanitizeFileName(rootLabel(location.root))
            : 'Sonstige'
          const targetDirectory = join(quarantineDir, label, dirname(relativePath))
          await mkdir(targetDirectory, { recursive: true })
          const targetPath = join(
            targetDirectory,
            await availableName(targetDirectory, basename(path))
          )
          await moveFile(path, targetPath, new AbortController().signal)
        } else if (request.disposition === 'trash') {
          await shell.trashItem(path)
        } else {
          await rm(path, { force: false })
        }

        removed.add(pathKey(path))
        bytesFreed += info.size
      } catch (error) {
        errors.push(`${path}: ${messageOf(error)}`)
      }
    }

    const groups = report.groups
      .map((group) => {
        const files = group.files.filter(
          (file) => !removed.has(pathKey(file.path))
        )
        return {
          ...group,
          files,
          wastedBytes: Math.max(0, group.size * Math.max(0, files.length - 1))
        }
      })
      .filter((group) => group.files.length >= 2)

    const totals = recomputeReportTotals(groups)
    report.groups = groups
    report.totalBytes = totals.totalBytes
    report.wastedBytes = totals.wastedBytes
    report.finishedAt = Date.now()

    return {
      removed: removed.size,
      bytesFreed,
      errors,
      report,
      quarantineDir
    }
  }

  async exportReport(
    request: DuplicateExportRequest
  ): Promise<string | null> {
    const report = this.reports.get(request.scanId)
    if (!report) throw new Error('Der Suchbericht ist nicht mehr verfügbar.')
    const format = request.format === 'json' ? 'json' : 'csv'
    const stamp = new Date().toISOString().slice(0, 10)
    const defaultPath = join(
      app.getPath('documents'),
      `archivio-duplikate-${stamp}.${format}`
    )
    const result = await dialog.showSaveDialog({
      title: 'Duplikatbericht speichern',
      defaultPath,
      filters:
        format === 'csv'
          ? [{ name: 'CSV-Datei', extensions: ['csv'] }]
          : [{ name: 'JSON-Datei', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return null

    if (format === 'json') {
      await writeFile(
        result.filePath,
        JSON.stringify(report, null, 2),
        'utf8'
      )
      return result.filePath
    }

    const rows: Array<Array<unknown>> = [
      [
        'Gruppe',
        'Hash',
        'Groesse (Bytes)',
        'Geaendert',
        'Datei',
        'Ordner',
        'Behalten (Vorschlag)'
      ]
    ]
    for (const group of report.groups) {
      const keeper = suggestedKeeper(group.files)
      for (const file of group.files) {
        rows.push([
          group.id,
          group.hash,
          group.size,
          new Date(file.modifiedMs).toISOString(),
          file.name,
          file.dir,
          file.path === keeper ? 'ja' : 'nein'
        ])
      }
    }
    await writeFile(result.filePath, `\uFEFF${toCsv(rows)}`, 'utf8')
    return result.filePath
  }

  private async run(
    report: DuplicateReport,
    options: {
      roots: string[]
      minSize: number
      includeHidden: boolean
      excludeNames: Set<string>
    },
    signal: AbortSignal
  ): Promise<void> {
    let lastEmit = 0
    const emit = (
      phase: DuplicateScanProgress['phase'],
      extra: Partial<DuplicateScanProgress> = {},
      force = false
    ): void => {
      const now = Date.now()
      if (!force && now - lastEmit < 250) return
      lastEmit = now
      report.phase = phase
      this.emitProgress({
        scanId: report.id,
        phase,
        scanned: report.scannedFiles,
        candidateFiles: report.candidateFiles,
        hashed: extra.hashed ?? 0,
        hashTotal: extra.hashTotal ?? 0,
        groups: extra.groups ?? report.groups.length,
        bytesHashed: extra.bytesHashed ?? 0,
        currentPath: extra.currentPath ?? null,
        message: extra.message ?? null
      })
    }

    const addError = (message: string): void => {
      if (report.errors.length < MAX_ERRORS) {
        report.errors.push(message)
      }
    }

    try {
      const buckets = new Map<number, DuplicateFile[]>()
      const stack = [...options.roots]
      const visited = new Set<string>()
      let candidateFiles = 0

      emit('walking', { message: 'Ordner werden durchsucht …' }, true)

      while (stack.length > 0) {
        if (signal.aborted) throw abortError()
        const directory = stack.pop() as string
        const key = pathKey(directory)
        if (visited.has(key)) continue
        visited.add(key)

        let handle
        try {
          handle = await opendir(directory)
        } catch (error) {
          addError(`${directory}: ${messageOf(error)}`)
          continue
        }

        try {
          for await (const dirent of handle) {
            if (signal.aborted) throw abortError()
            if (dirent.isSymbolicLink()) continue
            const fullPath = join(directory, dirent.name)
            const lowerName = dirent.name.toLocaleLowerCase('de-DE')

            if (dirent.isDirectory()) {
              if (!options.includeHidden && dirent.name.startsWith('.')) {
                continue
              }
              if (options.excludeNames.has(lowerName)) continue
              stack.push(fullPath)
              continue
            }

            if (!dirent.isFile()) continue
            if (!options.includeHidden && dirent.name.startsWith('.')) {
              continue
            }
            if (options.excludeNames.has(lowerName)) continue
            if (lowerName.startsWith('.archivio-')) continue

            try {
              const info = await lstat(fullPath)
              if (!info.isFile() || info.size < options.minSize) continue
              const file: DuplicateFile = {
                path: fullPath,
                name: dirent.name,
                dir: directory,
                size: info.size,
                modifiedMs: info.mtimeMs
              }
              const bucket = buckets.get(file.size)
              if (bucket) {
                if (bucket.length === 1) candidateFiles += 2
                else candidateFiles += 1
                bucket.push(file)
              } else {
                buckets.set(file.size, [file])
              }
              report.scannedFiles += 1
              if (report.scannedFiles % 100 === 0) {
                report.candidateFiles = candidateFiles
                emit('walking', {
                  currentPath: fullPath,
                  message: 'Ordner werden durchsucht …'
                })
              }
            } catch (error) {
              addError(`${fullPath}: ${messageOf(error)}`)
            }
          }
        } catch (error) {
          if (signal.aborted || isAbortError(error)) throw abortError()
          addError(`${directory}: ${messageOf(error)}`)
        }
      }

      const candidates: DuplicateFile[] = []
      for (const bucket of buckets.values()) {
        if (bucket.length >= 2) candidates.push(...bucket)
      }
      report.candidateFiles = candidates.length

      if (candidates.length < 2) {
        report.finishedAt = Date.now()
        report.phase = 'done'
        emit('done', { message: 'Keine Duplikate gefunden.' }, true)
        return
      }

      emit(
        'hashing',
        {
          hashTotal: candidates.length,
          message: 'Dateien werden verglichen …'
        },
        true
      )

      const hashedFiles: Array<DuplicateFile & { hash: string }> = []
      const byHash = new Map<string, number>()
      let hashed = 0
      let bytesHashed = 0
      let groupCount = 0

      await mapLimit(
        candidates,
        HASH_CONCURRENCY,
        async (file) => {
          if (signal.aborted) throw abortError()
          try {
            const info = await lstat(file.path)
            const hash = await this.hashCache.get(file.path, info, signal)
            hashed += 1
            bytesHashed += file.size
            hashedFiles.push({ ...file, hash })
            const groupKey = `${file.size}:${hash}`
            const count = (byHash.get(groupKey) ?? 0) + 1
            byHash.set(groupKey, count)
            if (count === 2) groupCount += 1
            emit(
              'hashing',
              {
                hashed,
                hashTotal: candidates.length,
                groups: groupCount,
                bytesHashed,
                currentPath: file.path,
                message: 'Dateien werden verglichen …'
              }
            )
          } catch (error) {
            if (signal.aborted || isAbortError(error)) throw abortError()
            addError(`${file.path}: ${messageOf(error)}`)
          }
        },
        signal
      )

      const groups = buildDuplicateGroups(
        hashedFiles.map((file) => ({
          path: file.path,
          name: file.name,
          dir: file.dir,
          size: file.size,
          modifiedMs: file.modifiedMs,
          hash: file.hash
        }))
      )
      const totals = recomputeReportTotals(groups)
      report.groups = groups
      report.totalBytes = totals.totalBytes
      report.wastedBytes = totals.wastedBytes
      report.finishedAt = Date.now()
      report.phase = 'done'
      emit(
        'done',
        {
          hashed,
          hashTotal: candidates.length,
          groups: groups.length,
          bytesHashed,
          message:
            groups.length === 0
              ? 'Keine Duplikate gefunden.'
              : `${groups.length} Duplikatgruppen gefunden.`
        },
        true
      )
    } catch (error) {
      report.finishedAt = Date.now()
      if (isAbortError(error) || signal.aborted) {
        report.phase = 'cancelled'
        emit('cancelled', { message: 'Suche abgebrochen.' }, true)
      } else {
        report.phase = 'error'
        addError(messageOf(error))
        emit('error', { message: messageOf(error) }, true)
      }
    } finally {
      this.scans.delete(report.id)
    }
  }

  private pruneReports(): void {
    for (const id of this.reports.keys()) {
      if (this.reports.size <= MAX_REPORTS) break
      if (this.scans.has(id)) continue
      this.reports.delete(id)
    }
  }
}

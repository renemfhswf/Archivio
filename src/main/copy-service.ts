import { randomUUID, createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import type { Stats } from 'node:fs'
import {
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  rm,
  stat,
  utimes
} from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { COPY_CHUNK_SIZE } from '../shared/constants'
import { isSamePath, nextNumberedName } from '../shared/naming'
import type {
  ConflictDecision,
  CopyConflict,
  CopyError,
  CopyPlan,
  CopyPlanItem,
  CopyProgress,
  CopyRequest,
  CopySummary,
  FileEntry,
  QueueJob
} from '../shared/types'
import {
  abortError,
  HashCache,
  hashFile,
  isAbortError,
  mapLimit
} from './hash'
import { assertAbsolutePath, pathKey } from './paths'

const MAX_JOBS = 5000
const PLAN_TTL_MS = 2 * 60 * 60 * 1000

interface StoredPlan {
  id: string
  createdAt: number
  items: CopyPlanItem[]
  jobs: Map<string, QueueJob>
  totalBytes: number
}

export interface CopyFileOptions {
  verify: boolean
  preserveTimestamps: boolean
  replaceExisting: boolean
  signal: AbortSignal
  onProgress?: (bytesDone: number) => void
  onVerifying?: () => void
}

export interface CopyFileResult {
  bytes: number
  targetPath: string
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unbekannter Fehler'
}

function entryFromStats(
  name: string,
  path: string,
  info: Stats
): FileEntry {
  const dot = name.lastIndexOf('.')
  return {
    name,
    path,
    kind: 'file',
    size: info.size,
    modifiedMs: info.mtimeMs,
    createdMs: info.birthtimeMs || info.ctimeMs,
    extension: dot > 0 ? name.slice(dot + 1).toLocaleLowerCase('de-DE') : '',
    isSymlink: false
  }
}

async function fsyncFile(path: string): Promise<void> {
  const handle = await open(path, 'r+')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function availableName(
  directory: string,
  name: string
): Promise<string> {
  let entries: Set<string>
  try {
    entries = new Set(await readdir(directory))
  } catch {
    entries = new Set()
  }
  return nextNumberedName(name, entries)
}

/**
 * Kopiert eine Datei über eine temporäre Datei im Zielordner. Erst nach
 * vollständigem Schreiben (und optionaler Prüfsummenkontrolle) wird sie
 * an ihren endgültigen Namen umbenannt. Ein vorhandenes Ziel wird vorher
 * als Sicherung beiseitegelegt und bei einem Fehler wiederhergestellt.
 */
export async function copyFileSafe(
  sourcePath: string,
  targetPath: string,
  options: CopyFileOptions
): Promise<CopyFileResult> {
  const directory = dirname(targetPath)
  await mkdir(directory, { recursive: true })

  const sourceInfo = await stat(sourcePath)
  if (!sourceInfo.isFile()) {
    throw new Error('Die Quelldatei ist keine reguläre Datei.')
  }

  let targetInfo: Stats | null = null
  try {
    targetInfo = await lstat(targetPath)
  } catch {
    targetInfo = null
  }
  if (targetInfo && !targetInfo.isFile()) {
    throw new Error('Am Zielpfad liegt keine reguläre Datei.')
  }
  if (targetInfo && !options.replaceExisting) {
    const conflict = new Error('Die Zieldatei ist inzwischen vorhanden.') as NodeJS.ErrnoException
    conflict.code = 'EEXIST'
    throw conflict
  }

  const tempPath = join(directory, `.archivio-${randomUUID()}.tmp`)
  const backupPath = join(directory, `.archivio-${randomUUID()}.bak`)
  let backupCreated = false
  let written = 0
  const sourceHash = options.verify ? createHash('sha256') : null

  try {
    const read = createReadStream(sourcePath, {
      highWaterMark: COPY_CHUNK_SIZE,
      signal: options.signal
    })
    const write = createWriteStream(tempPath, {
      flags: 'wx',
      mode: (sourceInfo.mode & 0o777) || 0o666
    })
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        written += chunk.length
        sourceHash?.update(chunk)
        options.onProgress?.(written)
        callback(null, chunk)
      }
    })

    await pipeline(read, counter, write, { signal: options.signal })
    await fsyncFile(tempPath)

    if (sourceHash) {
      options.onVerifying?.()
      const expected = sourceHash.digest('hex')
      const actual = await hashFile(tempPath, options.signal)
      if (expected !== actual) {
        throw new Error(
          'Die Prüfsumme der kopierten Datei stimmt nicht mit der Quelle überein.'
        )
      }
    }

    if (targetInfo) {
      await rename(targetPath, backupPath)
      backupCreated = true
      try {
        await rename(tempPath, targetPath)
      } catch (error) {
        await rename(backupPath, targetPath).catch(() => undefined)
        backupCreated = false
        throw error
      }
      await rm(backupPath, { force: true })
      backupCreated = false
    } else {
      await rename(tempPath, targetPath)
    }

    if (options.preserveTimestamps) {
      try {
        await utimes(targetPath, sourceInfo.atime, sourceInfo.mtime)
      } catch {
        // Zeitstempel sind Komfort, kein Grund, den Kopiervorgang zu verwerfen.
      }
    }

    return { bytes: written, targetPath }
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined)
    if (backupCreated) {
      await rename(backupPath, targetPath).catch(() => undefined)
    }
    throw error
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined)
    await rm(backupPath, { force: true }).catch(() => undefined)
  }
}

export class CopyService {
  private readonly plans = new Map<string, StoredPlan>()
  private readonly batches = new Map<string, AbortController>()

  constructor(
    private readonly emitProgress: (progress: CopyProgress) => void,
    private readonly hashCache: HashCache
  ) {}

  async plan(jobs: QueueJob[]): Promise<CopyPlan> {
    if (!Array.isArray(jobs)) throw new Error('Ungültige Dateiliste.')
    if (jobs.length > MAX_JOBS) {
      throw new Error(`Es können höchstens ${MAX_JOBS} Dateien auf einmal kopiert werden.`)
    }

    const uniqueJobs: QueueJob[] = []
    const seen = new Set<string>()
    for (const job of jobs) {
      if (!job || typeof job !== 'object') continue
      const sourcePath = assertAbsolutePath(job.sourcePath, 'Quelldatei')
      const targetDir = assertAbsolutePath(job.targetDir, 'Zielordner')
      const key = `${pathKey(sourcePath)}|${pathKey(targetDir)}`
      if (seen.has(key)) continue
      seen.add(key)
      uniqueJobs.push({
        id: typeof job.id === 'string' && job.id ? job.id : randomUUID(),
        sourcePath,
        targetDir
      })
    }

    const items = await mapLimit(uniqueJobs, 8, async (job) => {
      const targetPath = join(job.targetDir, basename(job.sourcePath))
      try {
        const sourceInfo = await stat(job.sourcePath)
        if (!sourceInfo.isFile()) {
          throw new Error('Die Quelldatei ist keine reguläre Datei.')
        }
        const targetDirInfo = await stat(job.targetDir)
        if (!targetDirInfo.isDirectory()) {
          throw new Error('Der Zielpfad ist kein Ordner.')
        }
        if (isSamePath(job.sourcePath, targetPath, process.platform)) {
          throw new Error('Quelle und Ziel sind identisch.')
        }

        let conflict: CopyConflict | null = null
        try {
          const targetInfo = await lstat(targetPath)
          if (!targetInfo.isFile()) {
            throw new Error('Am Zielpfad liegt bereits ein Ordner.')
          }
          const existing = entryFromStats(
            basename(targetPath),
            targetPath,
            targetInfo
          )
          let kind: CopyConflict['kind'] = 'name'
          if (targetInfo.size === sourceInfo.size) {
            const sourceHash = await this.hashCache.get(
              job.sourcePath,
              sourceInfo
            )
            const targetHash = await this.hashCache.get(
              targetPath,
              targetInfo
            )
            if (sourceHash === targetHash) kind = 'duplicate'
          }
          conflict = {
            jobId: job.id,
            sourcePath: job.sourcePath,
            targetPath,
            kind,
            existing,
            suggestedName: await availableName(
              job.targetDir,
              basename(job.sourcePath)
            )
          }
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code
          if (code !== 'ENOENT') throw error
        }

        const item: CopyPlanItem = {
          jobId: job.id,
          sourcePath: job.sourcePath,
          sourceSize: sourceInfo.size,
          targetPath,
          status: conflict ? 'conflict' : 'ready',
          error: null,
          conflict
        }
        return item
      } catch (error) {
        return {
          jobId: job.id,
          sourcePath: job.sourcePath,
          sourceSize: 0,
          targetPath,
          status: 'error',
          error: messageOf(error),
          conflict: null
        } satisfies CopyPlanItem
      }
    })

    const planId = randomUUID()
    const totalBytes = items
      .filter((item) => item.status !== 'error')
      .reduce((sum, item) => sum + item.sourceSize, 0)
    const stored: StoredPlan = {
      id: planId,
      createdAt: Date.now(),
      items,
      jobs: new Map(uniqueJobs.map((job) => [job.id, job])),
      totalBytes
    }
    this.plans.set(planId, stored)
    this.prunePlans()

    return {
      id: planId,
      items,
      conflicts: items
        .map((item) => item.conflict)
        .filter((conflict): conflict is CopyConflict => conflict !== null),
      totalBytes,
      readyCount: items.filter((item) => item.status === 'ready').length,
      conflictCount: items.filter((item) => item.status === 'conflict').length,
      errorCount: items.filter((item) => item.status === 'error').length
    }
  }

  async start(request: CopyRequest): Promise<CopySummary> {
    const stored = this.plans.get(request.planId)
    if (!stored) {
      throw new Error(
        'Der Kopierplan ist abgelaufen. Bitte die Dateien erneut prüfen.'
      )
    }

    const startedAt = Date.now()
    const batchId = randomUUID()
    const controller = new AbortController()
    this.batches.set(batchId, controller)

    const decisions = request.decisions ?? {}
    const fallback: ConflictDecision = ['skip', 'replace', 'rename'].includes(
      request.defaultDecision
    )
      ? request.defaultDecision
      : 'skip'
    const concurrency = Math.min(6, Math.max(1, request.concurrency || 2))
    const errors: CopyError[] = []
    let copied = 0
    let skipped = 0
    let failed = 0
    let bytes = 0

    const pending: Array<{
      item: CopyPlanItem
      decision: ConflictDecision | null
      itemIndex: number
    }> = []

    for (let index = 0; index < stored.items.length; index += 1) {
      const item = stored.items[index]
      if (item.status === 'error') {
        failed += 1
        errors.push({
          jobId: item.jobId,
          sourcePath: item.sourcePath,
          targetPath: item.targetPath,
          message: item.error ?? 'Unbekannter Planungsfehler'
        })
        this.emitProgress({
          batchId,
          jobId: item.jobId,
          phase: 'error',
          fileIndex: index + 1,
          fileCount: stored.items.length,
          bytesDone: 0,
          totalBytes: item.sourceSize,
          overallBytesDone: 0,
          overallBytesTotal: stored.totalBytes,
          fileName: basename(item.sourcePath),
          targetPath: item.targetPath,
          message: item.error
        })
        continue
      }

      if (item.status === 'conflict') {
        const decision = decisions[item.jobId] ?? fallback
        if (decision === 'skip') {
          skipped += 1
          this.emitProgress({
            batchId,
            jobId: item.jobId,
            phase: 'skipped',
            fileIndex: index + 1,
            fileCount: stored.items.length,
            bytesDone: 0,
            totalBytes: item.sourceSize,
            overallBytesDone: 0,
            overallBytesTotal: stored.totalBytes,
            fileName: basename(item.sourcePath),
            targetPath: item.targetPath,
            message: 'Wegen Konflikt übersprungen'
          })
          continue
        }
        pending.push({ item, decision, itemIndex: index })
      } else {
        pending.push({ item, decision: null, itemIndex: index })
      }
    }

    const overallTotal = pending.reduce(
      (sum, entry) => sum + entry.item.sourceSize,
      0
    )
    let overallDone = 0
    let lastEmit = 0

    const emit = (
      entry: (typeof pending)[number],
      phase: CopyProgress['phase'],
      bytesDone: number,
      targetPath: string,
      message: string | null,
      force = false
    ): void => {
      const now = Date.now()
      if (!force && now - lastEmit < 80) return
      lastEmit = now
      this.emitProgress({
        batchId,
        jobId: entry.item.jobId,
        phase,
        fileIndex: entry.itemIndex + 1,
        fileCount: stored.items.length,
        bytesDone,
        totalBytes: entry.item.sourceSize,
        overallBytesDone: Math.min(overallDone, overallTotal),
        overallBytesTotal: overallTotal,
        fileName: basename(entry.item.sourcePath),
        targetPath,
        message
      })
    }

    let cancelled = false

    try {
      await mapLimit(
        pending,
        concurrency,
        async (entry) => {
          if (controller.signal.aborted) throw abortError()
          const { item, decision } = entry
          const targetDir = dirname(item.targetPath)
          const fileName = basename(item.sourcePath)
          let finalTarget = item.targetPath

          try {
            if (decision === 'rename') {
              finalTarget = join(
                targetDir,
                await availableName(targetDir, fileName)
              )
            } else if (decision !== 'replace') {
              // Zwischen Planung und Start kann die Zieldatei entstanden sein.
              try {
                await lstat(finalTarget)
                finalTarget = join(
                  targetDir,
                  await availableName(targetDir, fileName)
                )
              } catch {
                // Ziel ist weiterhin frei.
              }
            }

            emit(entry, 'copying', 0, finalTarget, null, true)
            let lastFileBytes = 0
            let result: CopyFileResult | null = null
            let attempts = 0
            while (!result) {
              try {
                result = await copyFileSafe(item.sourcePath, finalTarget, {
                  verify: request.verify,
                  preserveTimestamps: request.preserveTimestamps,
                  replaceExisting: decision === 'replace',
                  signal: controller.signal,
                  onProgress: (done) => {
                    const delta = done - lastFileBytes
                    lastFileBytes = done
                    overallDone = Math.min(overallTotal, overallDone + delta)
                    emit(entry, 'copying', done, finalTarget, null)
                  },
                  onVerifying: () => {
                    emit(
                      entry,
                      'verifying',
                      item.sourceSize,
                      finalTarget,
                      'Prüfsumme wird verglichen …',
                      true
                    )
                  }
                })
              } catch (error) {
                const code = (error as NodeJS.ErrnoException).code
                if (code === 'EEXIST' && attempts < 2) {
                  attempts += 1
                  finalTarget = join(
                    targetDir,
                    await availableName(targetDir, fileName)
                  )
                  lastFileBytes = 0
                  emit(entry, 'copying', 0, finalTarget, null, true)
                  continue
                }
                throw error
              }
            }
            copied += 1
            bytes += result.bytes
            overallDone = Math.min(overallTotal, overallDone)
            emit(entry, 'done', result.bytes, result.targetPath, null, true)
          } catch (error) {
            if (isAbortError(error) || controller.signal.aborted) {
              throw abortError()
            }
            failed += 1
            const message = messageOf(error)
            errors.push({
              jobId: item.jobId,
              sourcePath: item.sourcePath,
              targetPath: finalTarget,
              message
            })
            emit(entry, 'error', 0, finalTarget, message, true)
          }
        },
        controller.signal
      )
    } catch (error) {
      if (isAbortError(error)) {
        cancelled = true
      } else {
        failed += 1
        errors.push({
          jobId: batchId,
          sourcePath: '',
          targetPath: '',
          message: messageOf(error)
        })
      }
    } finally {
      this.batches.delete(batchId)
      this.plans.delete(request.planId)
    }

    return {
      batchId,
      copied,
      skipped,
      failed,
      bytes,
      durationMs: Date.now() - startedAt,
      cancelled,
      errors,
      completedAt: Date.now()
    }
  }

  cancel(batchId: string): void {
    this.batches.get(batchId)?.abort()
  }

  cancelAll(): void {
    for (const controller of this.batches.values()) {
      controller.abort()
    }
  }

  private prunePlans(): void {
    const now = Date.now()
    for (const [id, plan] of this.plans) {
      if (now - plan.createdAt > PLAN_TTL_MS) {
        this.plans.delete(id)
      }
    }
    while (this.plans.size > 20) {
      const oldest = this.plans.keys().next()
      if (oldest.done) break
      this.plans.delete(oldest.value)
    }
  }
}

export { availableName }

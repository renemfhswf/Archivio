import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  copyFileSafe,
  CopyService,
  type CopyFileOptions
} from '../src/main/copy-service'
import { HashCache } from '../src/main/hash'
import type { CopyProgress } from '../src/shared/types'

let root: string
let sourceDir: string
let targetDir: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'archivio-test-'))
  sourceDir = join(root, 'quelle')
  targetDir = join(root, 'ziel')
  await Promise.all([
    mkdir(sourceDir, { recursive: true }),
    mkdir(targetDir, { recursive: true })
  ])
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function options(overrides: Partial<CopyFileOptions> = {}): CopyFileOptions {
  return {
    verify: true,
    preserveTimestamps: true,
    replaceExisting: false,
    signal: new AbortController().signal,
    ...overrides
  }
}

async function tempArtifacts(directory: string): Promise<string[]> {
  const entries = await readdir(directory)
  return entries.filter((name) => name.startsWith('.archivio-'))
}

describe('copyFileSafe', () => {
  it('copies content, reports bytes and leaves no temporary files', async () => {
    const source = join(sourceDir, 'bericht.txt')
    const target = join(targetDir, 'bericht.txt')
    const content = 'Archivio Testinhalt\n'.repeat(500)
    await writeFile(source, content)

    const progress: number[] = []
    const result = await copyFileSafe(
      source,
      target,
      options({
        onProgress: (bytes) => progress.push(bytes)
      })
    )

    expect(result.bytes).toBe(Buffer.byteLength(content))
    expect(result.targetPath).toBe(target)
    expect(await readFile(target, 'utf8')).toBe(content)
    expect(progress.length).toBeGreaterThan(0)
    expect(progress[progress.length - 1]).toBe(Buffer.byteLength(content))
    expect(await tempArtifacts(targetDir)).toEqual([])
  })

  it('creates missing target directories', async () => {
    const source = join(sourceDir, 'tief.txt')
    const target = join(targetDir, 'a', 'b', 'c', 'tief.txt')
    await writeFile(source, 'inhalt')

    await copyFileSafe(source, target, options())

    expect(await readFile(target, 'utf8')).toBe('inhalt')
  })

  it('preserves the modification timestamp when requested', async () => {
    const source = join(sourceDir, 'zeit.txt')
    const target = join(targetDir, 'zeit.txt')
    await writeFile(source, 'zeit')
    const stamp = new Date('2021-03-04T05:06:07Z')
    await utimes(source, stamp, stamp)

    await copyFileSafe(source, target, options({ preserveTimestamps: true }))

    const targetInfo = await stat(target)
    expect(Math.abs(targetInfo.mtimeMs - stamp.getTime())).toBeLessThan(2000)
  })

  it('refuses to overwrite without replaceExisting', async () => {
    const source = join(sourceDir, 'gleich.txt')
    const target = join(targetDir, 'gleich.txt')
    await writeFile(source, 'neu')
    await writeFile(target, 'alt')

    await expect(
      copyFileSafe(source, target, options({ replaceExisting: false }))
    ).rejects.toMatchObject({ code: 'EEXIST' })
    expect(await readFile(target, 'utf8')).toBe('alt')
    expect(await tempArtifacts(targetDir)).toEqual([])
  })

  it('replaces an existing file atomically and removes the backup', async () => {
    const source = join(sourceDir, 'gleich.txt')
    const target = join(targetDir, 'gleich.txt')
    await writeFile(source, 'neuer inhalt')
    await writeFile(target, 'alter inhalt')

    await copyFileSafe(source, target, options({ replaceExisting: true }))

    expect(await readFile(target, 'utf8')).toBe('neuer inhalt')
    expect(await readdir(targetDir)).toEqual(['gleich.txt'])
  })

  it('rejects a directory at the target path', async () => {
    const source = join(sourceDir, 'datei.txt')
    const target = join(targetDir, 'ordner')
    await writeFile(source, 'x')
    await mkdir(target)

    await expect(copyFileSafe(source, target, options())).rejects.toThrow(
      /keine reguläre Datei/
    )
  })

  it('rejects non-file sources', async () => {
    const source = join(sourceDir, 'unterordner')
    const target = join(targetDir, 'unterordner')
    await mkdir(source)

    await expect(copyFileSafe(source, target, options())).rejects.toThrow(
      /keine reguläre Datei/
    )
  })

  it('stops when the signal is already aborted', async () => {
    const source = join(sourceDir, 'abbruch.txt')
    const target = join(targetDir, 'abbruch.txt')
    await writeFile(source, 'x'.repeat(4096))
    const controller = new AbortController()
    controller.abort()

    await expect(
      copyFileSafe(source, target, options({ signal: controller.signal }))
    ).rejects.toThrow()
    expect(await tempArtifacts(targetDir)).toEqual([])
  })
})

describe('CopyService', () => {
  function createService(): {
    service: CopyService
    events: CopyProgress[]
  } {
    const events: CopyProgress[] = []
    return {
      service: new CopyService((progress) => events.push(progress), new HashCache()),
      events
    }
  }

  it('plans a free target as ready and copies it', async () => {
    const source = join(sourceDir, 'frei.txt')
    await writeFile(source, 'freier inhalt')
    const { service, events } = createService()

    const plan = await service.plan([
      { id: 'job-1', sourcePath: source, targetDir }
    ])

    expect(plan.readyCount).toBe(1)
    expect(plan.conflictCount).toBe(0)
    expect(plan.errorCount).toBe(0)
    expect(plan.totalBytes).toBe(Buffer.byteLength('freier inhalt'))

    const summary = await service.start({
      planId: plan.id,
      decisions: {},
      defaultDecision: 'skip',
      verify: true,
      preserveTimestamps: true,
      concurrency: 2
    })

    expect(summary.copied).toBe(1)
    expect(summary.failed).toBe(0)
    expect(summary.skipped).toBe(0)
    expect(await readFile(join(targetDir, 'frei.txt'), 'utf8')).toBe(
      'freier inhalt'
    )
    expect(events.some((event) => event.phase === 'done')).toBe(true)
    expect(events.some((event) => event.phase === 'verifying')).toBe(true)
  })

  it('detects identical content as duplicate conflict', async () => {
    const source = join(sourceDir, 'doppelt.txt')
    await writeFile(source, 'identisch')
    await writeFile(join(targetDir, 'doppelt.txt'), 'identisch')
    const { service } = createService()

    const plan = await service.plan([
      { id: 'job-2', sourcePath: source, targetDir }
    ])

    expect(plan.conflictCount).toBe(1)
    expect(plan.conflicts[0].kind).toBe('duplicate')
    expect(plan.conflicts[0].suggestedName).toBe('doppelt (2).txt')
  })

  it('detects a same-name different-content conflict', async () => {
    const source = join(sourceDir, 'name.txt')
    await writeFile(source, 'neu')
    await writeFile(join(targetDir, 'name.txt'), 'alt')
    const { service } = createService()

    const plan = await service.plan([
      { id: 'job-3', sourcePath: source, targetDir }
    ])

    expect(plan.conflictCount).toBe(1)
    expect(plan.conflicts[0].kind).toBe('name')
  })

  it('skips duplicate conflicts by decision', async () => {
    const source = join(sourceDir, 'skip.txt')
    await writeFile(source, 'gleich')
    await writeFile(join(targetDir, 'skip.txt'), 'gleich')
    const { service } = createService()

    const plan = await service.plan([
      { id: 'job-4', sourcePath: source, targetDir }
    ])
    const summary = await service.start({
      planId: plan.id,
      decisions: { 'job-4': 'skip' },
      defaultDecision: 'skip',
      verify: true,
      preserveTimestamps: true,
      concurrency: 1
    })

    expect(summary.skipped).toBe(1)
    expect(summary.copied).toBe(0)
    expect(await readFile(join(targetDir, 'skip.txt'), 'utf8')).toBe('gleich')
  })

  it('renames a name conflict when requested', async () => {
    const source = join(sourceDir, 'umbenennen.txt')
    await writeFile(source, 'neu')
    await writeFile(join(targetDir, 'umbenennen.txt'), 'alt')
    const { service } = createService()

    const plan = await service.plan([
      { id: 'job-5', sourcePath: source, targetDir }
    ])
    const summary = await service.start({
      planId: plan.id,
      decisions: { 'job-5': 'rename' },
      defaultDecision: 'rename',
      verify: true,
      preserveTimestamps: true,
      concurrency: 1
    })

    expect(summary.copied).toBe(1)
    expect(await readFile(join(targetDir, 'umbenennen.txt'), 'utf8')).toBe('alt')
    expect(await readFile(join(targetDir, 'umbenennen (2).txt'), 'utf8')).toBe(
      'neu'
    )
  })

  it('marks missing sources as plan errors', async () => {
    const { service } = createService()
    const plan = await service.plan([
      { id: 'job-6', sourcePath: join(sourceDir, 'fehlt.txt'), targetDir }
    ])

    expect(plan.errorCount).toBe(1)
    expect(plan.readyCount).toBe(0)

    const summary = await service.start({
      planId: plan.id,
      decisions: {},
      defaultDecision: 'skip',
      verify: true,
      preserveTimestamps: true,
      concurrency: 1
    })

    expect(summary.failed).toBe(1)
    expect(summary.errors).toHaveLength(1)
  })

  it('rejects relative paths during planning', async () => {
    const { service } = createService()
    await expect(
      service.plan([{ id: 'job-7', sourcePath: 'relativ.txt', targetDir }])
    ).rejects.toThrow(/absolut/)
  })

  it('rejects unknown plan ids', async () => {
    const { service } = createService()
    await expect(
      service.start({
        planId: 'unbekannt',
        decisions: {},
        defaultDecision: 'skip',
        verify: false,
        preserveTimestamps: false,
        concurrency: 1
      })
    ).rejects.toThrow(/abgelaufen/)
  })
})

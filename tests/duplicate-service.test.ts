import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp'
  },
  dialog: {
    showSaveDialog: vi.fn()
  },
  shell: {
    trashItem: vi.fn(async (path: string) => {
      const { rm } = await import('node:fs/promises')
      await rm(path, { force: true })
    })
  }
}))

import { DuplicateService } from '../src/main/duplicate-service'
import { HashCache } from '../src/main/hash'
import type { DuplicateReport } from '../src/shared/types'

let root: string
let sourceA: string
let sourceB: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'archivio-dup-'))
  sourceA = join(root, 'Quelle A')
  sourceB = join(root, 'Quelle B')
  await mkdir(join(sourceA, 'Unterordner'), { recursive: true })
  await mkdir(sourceB, { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function scanToCompletion(
  roots: string[],
  options: Partial<{
    minSize: number
    includeHidden: boolean
    excludeNames: string[]
  }> = {}
): Promise<{ service: DuplicateService; report: DuplicateReport }> {
  return new Promise((resolve, reject) => {
    let service: DuplicateService
    const timeout = setTimeout(
      () => reject(new Error('Scan wurde nicht abgeschlossen.')),
      10_000
    )
    service = new DuplicateService((progress) => {
      if (progress.phase === 'done') {
        clearTimeout(timeout)
        const report = service.getReport(progress.scanId)
        if (!report) {
          reject(new Error('Bericht fehlt.'))
          return
        }
        resolve({ service, report })
      } else if (progress.phase === 'error') {
        clearTimeout(timeout)
        reject(new Error(progress.message ?? 'Scan-Fehler'))
      }
    }, new HashCache())
    service.start({
      roots,
      minSize: options.minSize ?? 0,
      includeHidden: options.includeHidden ?? true,
      excludeNames: options.excludeNames ?? []
    })
  })
}

describe('DuplicateService', () => {
  it('finds identical files across roots and ignores different content', async () => {
    const content = 'identischer inhalt'
    await writeFile(join(sourceA, 'eins.txt'), content)
    await writeFile(join(sourceA, 'Unterordner', 'zwei.txt'), content)
    await writeFile(join(sourceB, 'drei.txt'), content)
    await writeFile(join(sourceB, 'anders.txt'), 'etwas anderes')

    const { report } = await scanToCompletion([sourceA, sourceB])

    expect(report.phase).toBe('done')
    expect(report.groups).toHaveLength(1)
    expect(report.groups[0].files).toHaveLength(3)
    expect(report.groups[0].size).toBe(Buffer.byteLength(content))
    expect(report.wastedBytes).toBe(Buffer.byteLength(content) * 2)
    expect(report.scannedFiles).toBe(4)
  })

  it('respects the minimum size', async () => {
    await writeFile(join(sourceA, 'klein.txt'), 'x')
    await writeFile(join(sourceB, 'klein.txt'), 'x')
    await writeFile(join(sourceA, 'gross.txt'), 'y'.repeat(2048))
    await writeFile(join(sourceB, 'gross.txt'), 'y'.repeat(2048))

    const { report } = await scanToCompletion([sourceA, sourceB], {
      minSize: 1024
    })

    expect(report.groups).toHaveLength(1)
    expect(report.groups[0].size).toBe(2048)
  })

  it('can skip hidden files and excluded names', async () => {
    await writeFile(join(sourceA, 'sichtbar.txt'), 'gleich')
    await writeFile(join(sourceB, 'sichtbar.txt'), 'gleich')
    await writeFile(join(sourceA, '.versteckt.txt'), 'auch gleich')
    await writeFile(join(sourceB, '.versteckt.txt'), 'auch gleich')
    await writeFile(join(sourceA, 'ignore.me'), 'ignorieren')
    await writeFile(join(sourceB, 'ignore.me'), 'ignorieren')

    const { report } = await scanToCompletion([sourceA, sourceB], {
      includeHidden: false,
      excludeNames: ['ignore.me']
    })

    expect(report.groups).toHaveLength(1)
    expect(report.groups[0].files.map((file) => file.name)).toEqual([
      'sichtbar.txt',
      'sichtbar.txt'
    ])
  })

  it('moves selected duplicates to quarantine and keeps the keeper', async () => {
    const content = 'quarantäne-test'
    const keeper = join(sourceA, 'behalten.txt')
    const removedA = join(sourceA, 'Unterordner', 'entfernen.txt')
    const removedB = join(sourceB, 'entfernen.txt')
    await writeFile(keeper, content)
    await writeFile(removedA, content)
    await writeFile(removedB, content)

    const { service, report } = await scanToCompletion([sourceA, sourceB])
    const group = report.groups[0]
    const quarantineDir = join(root, 'Quarantäne')

    const result = await service.applyAction({
      scanId: report.id,
      disposition: 'quarantine',
      filePaths: [removedA, removedB],
      quarantineDir,
      confirmToken: null
    })

    expect(result.removed).toBe(2)
    expect(result.errors).toEqual([])
    expect(result.bytesFreed).toBe(Buffer.byteLength(content) * 2)
    expect(result.report.groups).toHaveLength(0)
    expect(await readFile(keeper, 'utf8')).toBe(content)
    await expect(stat(removedA)).rejects.toThrow()
    await expect(stat(removedB)).rejects.toThrow()
    expect(
      await readFile(
        join(quarantineDir, 'Quelle A', 'Unterordner', 'entfernen.txt'),
        'utf8'
      )
    ).toBe(content)
    expect(
      await readFile(join(quarantineDir, 'Quelle B', 'entfernen.txt'), 'utf8')
    ).toBe(content)
    expect(group.files).toHaveLength(3)
  })

  it('refuses to remove every file of a group', async () => {
    const content = 'alle weg?'
    const a = join(sourceA, 'a.txt')
    const b = join(sourceB, 'b.txt')
    await writeFile(a, content)
    await writeFile(b, content)

    const { service, report } = await scanToCompletion([sourceA, sourceB])

    await expect(
      service.applyAction({
        scanId: report.id,
        disposition: 'quarantine',
        filePaths: [a, b],
        quarantineDir: join(root, 'Quarantäne'),
        confirmToken: null
      })
    ).rejects.toThrow(/mindestens eine Datei/)
  })

  it('requires the confirmation token for permanent deletion', async () => {
    const content = 'löschen'
    const a = join(sourceA, 'a.txt')
    const b = join(sourceB, 'b.txt')
    await writeFile(a, content)
    await writeFile(b, content)

    const { service, report } = await scanToCompletion([sourceA, sourceB])

    await expect(
      service.applyAction({
        scanId: report.id,
        disposition: 'delete',
        filePaths: [b],
        quarantineDir: null,
        confirmToken: 'löschen'
      })
    ).rejects.toThrow(/LÖSCHEN/)

    const result = await service.applyAction({
      scanId: report.id,
      disposition: 'delete',
      filePaths: [b],
      quarantineDir: null,
      confirmToken: 'LÖSCHEN'
    })
    expect(result.removed).toBe(1)
    expect(result.report.groups).toHaveLength(0)
    await expect(stat(b)).rejects.toThrow()
  })

  it('rejects files that are not part of the report', async () => {
    const content = 'bericht'
    await writeFile(join(sourceA, 'a.txt'), content)
    await writeFile(join(sourceB, 'b.txt'), content)
    const fremd = join(root, 'fremd.txt')
    await writeFile(fremd, 'fremd')

    const { service, report } = await scanToCompletion([sourceA, sourceB])

    await expect(
      service.applyAction({
        scanId: report.id,
        disposition: 'delete',
        filePaths: [fremd],
        quarantineDir: null,
        confirmToken: 'LÖSCHEN'
      })
    ).rejects.toThrow(/gehört nicht zum aktuellen Bericht/)
  })

  it('cancels a running scan', async () => {
    await writeFile(join(sourceA, 'a.txt'), 'a')
    await writeFile(join(sourceB, 'b.txt'), 'b')

    const phases: string[] = []
    const done = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Abbruch wurde nicht bestätigt.')),
        10_000
      )
      const service = new DuplicateService((progress) => {
        phases.push(progress.phase)
        if (progress.phase === 'cancelled') {
          clearTimeout(timeout)
          resolve()
        }
      }, new HashCache())
      const scanId = service.start({
        roots: [sourceA, sourceB],
        minSize: 0,
        includeHidden: true,
        excludeNames: []
      })
      service.cancel(scanId)
    })

    await done
    expect(phases).toContain('cancelled')
  })
})

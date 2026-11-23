import type { DuplicateFile, DuplicateGroup } from './types'

export interface HashedFile {
  path: string
  name: string
  dir: string
  size: number
  modifiedMs: number
  hash: string
}

export function wastedBytes(size: number, fileCount: number): number {
  return Math.max(0, size * Math.max(0, fileCount - 1))
}

/**
 * Gruppiert bereits gehashte Dateien. Nur Gruppen mit mindestens zwei
 * identischen Dateien werden zurückgegeben.
 */
export function buildDuplicateGroups(files: HashedFile[]): DuplicateGroup[] {
  const buckets = new Map<string, DuplicateFile[]>()
  for (const file of files) {
    const key = `${file.size}:${file.hash}`
    const bucket = buckets.get(key)
    const entry: DuplicateFile = {
      path: file.path,
      name: file.name,
      dir: file.dir,
      size: file.size,
      modifiedMs: file.modifiedMs
    }
    if (bucket) {
      bucket.push(entry)
    } else {
      buckets.set(key, [entry])
    }
  }

  const groups: DuplicateGroup[] = []
  for (const [key, bucket] of buckets) {
    if (bucket.length < 2) continue
    const hash = key.slice(key.indexOf(':') + 1)
    const size = bucket[0].size
    groups.push({
      id: `${size}-${hash.slice(0, 16)}`,
      hash,
      size,
      files: bucket.sort((a, b) => a.path.localeCompare(b.path, 'de-DE')),
      wastedBytes: wastedBytes(size, bucket.length)
    })
  }

  return groups.sort((a, b) => {
    if (b.wastedBytes !== a.wastedBytes) return b.wastedBytes - a.wastedBytes
    return a.files[0].path.localeCompare(b.files[0].path, 'de-DE')
  })
}

export function suggestedKeeper(files: DuplicateFile[]): string | null {
  if (files.length === 0) return null
  return [...files].sort((a, b) => {
    if (a.modifiedMs !== b.modifiedMs) return a.modifiedMs - b.modifiedMs
    return a.path.length - b.path.length
  })[0].path
}

export function newestKeeper(files: DuplicateFile[]): string | null {
  if (files.length === 0) return null
  return [...files].sort((a, b) => {
    if (b.modifiedMs !== a.modifiedMs) return b.modifiedMs - a.modifiedMs
    return a.path.length - b.path.length
  })[0].path
}

export function recomputeReportTotals(groups: DuplicateGroup[]): {
  totalBytes: number
  wastedBytes: number
} {
  let totalBytes = 0
  let wasted = 0
  for (const group of groups) {
    totalBytes += group.size * group.files.length
    wasted += wastedBytes(group.size, group.files.length)
  }
  return { totalBytes, wastedBytes: wasted }
}

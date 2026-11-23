import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import type { Stats } from 'node:fs'

export function abortError(): Error {
  const error = new Error('Vorgang wurde abgebrochen.')
  error.name = 'AbortError'
  return error
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.message.includes('aborted'))
  )
}

export async function hashFile(
  path: string,
  signal?: AbortSignal
): Promise<string> {
  const hash = createHash('sha256')
  const stream = createReadStream(path, {
    highWaterMark: 1024 * 1024,
    signal
  })
  for await (const chunk of stream) {
    if (signal?.aborted) throw abortError()
    hash.update(chunk as Buffer)
  }
  return hash.digest('hex')
}

interface CacheEntry {
  size: number
  modifiedMs: number
  hash: string
}

const MAX_CACHE_ENTRIES = 100000

export class HashCache {
  private readonly cache = new Map<string, CacheEntry>()

  async get(
    path: string,
    info: Stats,
    signal?: AbortSignal
  ): Promise<string> {
    const key =
      process.platform === 'win32'
        ? path.toLocaleLowerCase('de-DE')
        : path
    const cached = this.cache.get(key)
    if (
      cached &&
      cached.size === info.size &&
      Math.abs(cached.modifiedMs - info.mtimeMs) < 0.5
    ) {
      this.cache.delete(key)
      this.cache.set(key, cached)
      return cached.hash
    }

    const hash = await hashFile(path, signal)
    this.cache.set(key, {
      size: info.size,
      modifiedMs: info.mtimeMs,
      hash
    })
    if (this.cache.size > MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next()
      if (!oldest.done) this.cache.delete(oldest.value)
    }
    return hash
  }

  clear(): void {
    this.cache.clear()
  }
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal
): Promise<R[]> {
  if (items.length === 0) return []
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workerCount = Math.max(1, Math.min(limit, items.length))

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      if (signal?.aborted) throw abortError()
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      results[index] = await fn(items[index], index)
    }
  })

  const settled = await Promise.allSettled(workers)
  const failed = settled.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  )
  if (failed) throw failed.reason
  if (signal?.aborted) throw abortError()
  return results
}

import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { HistoryEntry } from '../shared/types'
import { logError } from './logger'

const MAX_ENTRIES = 500

export class HistoryStore {
  private readonly filePath: string
  private entries: HistoryEntry[] = []

  constructor() {
    this.filePath = join(app.getPath('userData'), 'history.json')
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        this.entries = parsed
          .filter((entry): entry is HistoryEntry => {
            return (
              typeof entry === 'object' &&
              entry !== null &&
              typeof (entry as HistoryEntry).title === 'string' &&
              typeof (entry as HistoryEntry).timestamp === 'number'
            )
          })
          .slice(0, MAX_ENTRIES)
      }
    } catch {
      this.entries = []
    }
  }

  list(): HistoryEntry[] {
    return [...this.entries]
  }

  async add(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): Promise<HistoryEntry> {
    const complete: HistoryEntry = {
      ...entry,
      id: randomUUID(),
      timestamp: Date.now()
    }
    this.entries.unshift(complete)
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(0, MAX_ENTRIES)
    }
    await this.save()
    return complete
  }

  async clear(): Promise<void> {
    this.entries = []
    await this.save()
  }

  private async save(): Promise<void> {
    try {
      await mkdir(dirname(this.filePath), { recursive: true })
      const temporary = `${this.filePath}.tmp`
      await writeFile(temporary, JSON.stringify(this.entries, null, 2), 'utf8')
      await rename(temporary, this.filePath)
    } catch (error) {
      logError('Verlauf speichern', error)
    }
  }
}

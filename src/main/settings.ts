import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { DEFAULT_SETTINGS } from '../shared/constants'
import type {
  AppSettings,
  ConflictStrategy,
  ThemeMode
} from '../shared/types'
import { logError } from './logger'

const CONFLICT_STRATEGIES: ConflictStrategy[] = [
  'ask',
  'skip',
  'replace',
  'rename'
]
const THEMES: ThemeMode[] = ['dark', 'light', 'system']

function uniqueStrings(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return [...fallback]
  const seen = new Set<string>()
  const result: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (!trimmed) continue
    const key = trimmed.toLocaleLowerCase('de-DE')
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

function nullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

function sanitizeSettings(input: Partial<AppSettings>): AppSettings {
  return {
    archiveRoots: uniqueStrings(input.archiveRoots),
    favorites: uniqueStrings(input.favorites),
    conflictStrategy: CONFLICT_STRATEGIES.includes(
      input.conflictStrategy as ConflictStrategy
    )
      ? (input.conflictStrategy as ConflictStrategy)
      : DEFAULT_SETTINGS.conflictStrategy,
    verifyAfterCopy:
      typeof input.verifyAfterCopy === 'boolean'
        ? input.verifyAfterCopy
        : DEFAULT_SETTINGS.verifyAfterCopy,
    preserveTimestamps:
      typeof input.preserveTimestamps === 'boolean'
        ? input.preserveTimestamps
        : DEFAULT_SETTINGS.preserveTimestamps,
    copyConcurrency: clampNumber(
      input.copyConcurrency,
      DEFAULT_SETTINGS.copyConcurrency,
      1,
      6
    ),
    scanMinSize: clampNumber(
      input.scanMinSize,
      DEFAULT_SETTINGS.scanMinSize,
      0,
      1024 * 1024 * 1024
    ),
    scanIncludeHidden:
      typeof input.scanIncludeHidden === 'boolean'
        ? input.scanIncludeHidden
        : DEFAULT_SETTINGS.scanIncludeHidden,
    scanExcludeNames: uniqueStrings(
      input.scanExcludeNames,
      DEFAULT_SETTINGS.scanExcludeNames
    ),
    quarantineDir: nullableString(input.quarantineDir),
    previewMaxBytes: clampNumber(
      input.previewMaxBytes,
      DEFAULT_SETTINGS.previewMaxBytes,
      64 * 1024,
      10 * 1024 * 1024
    ),
    theme: THEMES.includes(input.theme as ThemeMode)
      ? (input.theme as ThemeMode)
      : DEFAULT_SETTINGS.theme,
    lastSourcePath: nullableString(input.lastSourcePath),
    lastTargetPath: nullableString(input.lastTargetPath)
  }
}

export class SettingsStore {
  private readonly filePath: string
  private data: AppSettings = { ...DEFAULT_SETTINGS }

  constructor() {
    this.filePath = join(app.getPath('userData'), 'settings.json')
  }

  async load(): Promise<AppSettings> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<AppSettings>
      this.data = sanitizeSettings({ ...DEFAULT_SETTINGS, ...parsed })
    } catch {
      this.data = { ...DEFAULT_SETTINGS }
    }
    return this.get()
  }

  get(): AppSettings {
    return {
      ...this.data,
      archiveRoots: [...this.data.archiveRoots],
      favorites: [...this.data.favorites],
      scanExcludeNames: [...this.data.scanExcludeNames]
    }
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    this.data = sanitizeSettings({ ...this.data, ...patch })
    await this.save()
    return this.get()
  }

  private async save(): Promise<void> {
    const directory = dirname(this.filePath)
    await mkdir(directory, { recursive: true })
    const temporary = `${this.filePath}.tmp`
    await writeFile(temporary, JSON.stringify(this.data, null, 2), 'utf8')
    await rename(temporary, this.filePath)
  }

  get previewLimit(): number {
    return Math.min(
      Math.max(this.data.previewMaxBytes, 64 * 1024),
      10 * 1024 * 1024
    )
  }
}

export async function safeSettingsUpdate(
  store: SettingsStore,
  patch: Partial<AppSettings>
): Promise<AppSettings> {
  try {
    return await store.update(patch)
  } catch (error) {
    logError('Einstellungen speichern', error)
    throw error
  }
}

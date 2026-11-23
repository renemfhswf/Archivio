import type { AppSettings } from './types'

export const APP_NAME = 'Archivio'
export const APP_ID = 'de.renemfhswf.archivio'

export const MAX_TEXT_PREVIEW_BYTES = 512 * 1024
export const MAX_OFFICE_PREVIEW_BYTES = 64 * 1024 * 1024
export const MAX_PDF_PREVIEW_BYTES = 128 * 1024 * 1024
export const MAX_IMAGE_PREVIEW_BYTES = 64 * 1024 * 1024
export const MAX_MEDIA_PREVIEW_BYTES = 4 * 1024 * 1024 * 1024

export const HASH_CONCURRENCY = 3
export const COPY_CHUNK_SIZE = 1024 * 1024

export const SYSTEM_EXCLUDES = [
  '$RECYCLE.BIN',
  'System Volume Information',
  'lost+found',
  '.Trash',
  '.Trashes',
  '.Spotlight-V100',
  '.fseventsd',
  'node_modules',
  '.git',
  '.svn',
  '__pycache__',
  'Thumbs.db',
  'desktop.ini',
  '_Archivio-Duplikate'
]

export const DEFAULT_SETTINGS: AppSettings = {
  archiveRoots: [],
  favorites: [],
  conflictStrategy: 'ask',
  verifyAfterCopy: true,
  preserveTimestamps: true,
  copyConcurrency: 2,
  scanMinSize: 1,
  scanIncludeHidden: false,
  scanExcludeNames: [...SYSTEM_EXCLUDES],
  quarantineDir: null,
  previewMaxBytes: MAX_TEXT_PREVIEW_BYTES,
  theme: 'dark',
  lastSourcePath: null,
  lastTargetPath: null
}

export const CONFLICT_STRATEGY_LABELS = {
  ask: 'Jedes Mal fragen',
  skip: 'Duplikate überspringen',
  replace: 'Vorhandene Dateien ersetzen',
  rename: 'Automatisch umbenennen'
} as const

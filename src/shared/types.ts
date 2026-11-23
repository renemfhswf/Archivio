/**
 * Gemeinsame Typen für Main-Prozess, Preload und Renderer.
 * Diese Datei darf keine Node- oder Electron-Importe enthalten.
 */

export type EntryKind = 'file' | 'directory'

export interface FileEntry {
  name: string
  path: string
  kind: EntryKind
  size: number
  modifiedMs: number
  createdMs: number
  extension: string
  isSymlink: boolean
}

export interface DirListing {
  path: string
  parent: string | null
  entries: FileEntry[]
  error: string | null
}

export type RootKind = 'drive' | 'home' | 'volume' | 'quick'

export interface RootEntry {
  name: string
  path: string
  kind: RootKind
  detail: string | null
}

export type PreviewKind =
  | 'image'
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'text'
  | 'video'
  | 'audio'
  | 'unsupported'

export interface PreviewInfo {
  kind: PreviewKind
  path: string
  name: string
  size: number
  modifiedMs: number
  mime: string
  extension: string
  url: string | null
  text: string | null
  truncated: boolean
  reason: string | null
}

export type ConflictStrategy = 'ask' | 'skip' | 'replace' | 'rename'
export type ThemeMode = 'dark' | 'light' | 'system'

export interface AppSettings {
  archiveRoots: string[]
  favorites: string[]
  conflictStrategy: ConflictStrategy
  verifyAfterCopy: boolean
  preserveTimestamps: boolean
  copyConcurrency: number
  scanMinSize: number
  scanIncludeHidden: boolean
  scanExcludeNames: string[]
  quarantineDir: string | null
  previewMaxBytes: number
  theme: ThemeMode
  lastSourcePath: string | null
  lastTargetPath: string | null
}

export interface QueueJob {
  id: string
  sourcePath: string
  targetDir: string
}

export type ConflictKind = 'duplicate' | 'name'
export type ConflictDecision = 'skip' | 'replace' | 'rename'

export interface CopyConflict {
  jobId: string
  sourcePath: string
  targetPath: string
  kind: ConflictKind
  existing: FileEntry
  suggestedName: string
}

export interface CopyPlanItem {
  jobId: string
  sourcePath: string
  sourceSize: number
  targetPath: string
  status: 'ready' | 'conflict' | 'error'
  error: string | null
  conflict: CopyConflict | null
}

export interface CopyPlan {
  id: string
  items: CopyPlanItem[]
  conflicts: CopyConflict[]
  totalBytes: number
  readyCount: number
  conflictCount: number
  errorCount: number
}

export interface CopyRequest {
  planId: string
  decisions: Record<string, ConflictDecision>
  defaultDecision: ConflictDecision
  verify: boolean
  preserveTimestamps: boolean
  concurrency: number
}

export type CopyPhase = 'copying' | 'verifying' | 'done' | 'skipped' | 'error'

export interface CopyProgress {
  batchId: string
  jobId: string
  phase: CopyPhase
  fileIndex: number
  fileCount: number
  bytesDone: number
  totalBytes: number
  overallBytesDone: number
  overallBytesTotal: number
  fileName: string
  targetPath: string
  message: string | null
}

export interface CopyError {
  jobId: string
  sourcePath: string
  targetPath: string
  message: string
}

export interface CopySummary {
  batchId: string
  copied: number
  skipped: number
  failed: number
  bytes: number
  durationMs: number
  cancelled: boolean
  errors: CopyError[]
  completedAt: number
}

export interface DuplicateScanOptions {
  roots: string[]
  minSize: number
  includeHidden: boolean
  excludeNames: string[]
}

export type ScanPhase = 'walking' | 'hashing' | 'done' | 'cancelled' | 'error'

export interface DuplicateScanProgress {
  scanId: string
  phase: ScanPhase
  scanned: number
  candidateFiles: number
  hashed: number
  hashTotal: number
  groups: number
  bytesHashed: number
  currentPath: string | null
  message: string | null
}

export interface DuplicateFile {
  path: string
  name: string
  dir: string
  size: number
  modifiedMs: number
}

export interface DuplicateGroup {
  id: string
  hash: string
  size: number
  files: DuplicateFile[]
  wastedBytes: number
}

export interface DuplicateReport {
  id: string
  startedAt: number
  finishedAt: number | null
  roots: string[]
  groups: DuplicateGroup[]
  scannedFiles: number
  candidateFiles: number
  totalBytes: number
  wastedBytes: number
  errors: string[]
  phase: ScanPhase
}

export type DuplicateDisposition = 'quarantine' | 'trash' | 'delete'

export interface DuplicateActionRequest {
  scanId: string
  disposition: DuplicateDisposition
  filePaths: string[]
  quarantineDir: string | null
  confirmToken: string | null
}

export interface DuplicateActionResult {
  removed: number
  bytesFreed: number
  errors: string[]
  report: DuplicateReport
  quarantineDir: string | null
}

export interface DuplicateExportRequest {
  scanId: string
  format: 'csv' | 'json'
}

export type HistoryType = 'copy' | 'quarantine' | 'trash' | 'delete' | 'scan'

export interface HistoryEntry {
  id: string
  timestamp: number
  type: HistoryType
  title: string
  detail: string
  count: number
  bytes: number
  errors: number
}

export interface AppInfo {
  version: string
  platform: string
  dataDir: string
  logFile: string
  quarantineDefault: string | null
}

export interface ChooseDirectoryOptions {
  title?: string
  defaultPath?: string | null
}

export interface ArchivioApi {
  getRoots(): Promise<RootEntry[]>
  listDirectory(path: string): Promise<DirListing>
  chooseDirectory(options?: ChooseDirectoryOptions): Promise<string | null>
  chooseDirectories(options?: ChooseDirectoryOptions): Promise<string[]>
  getSettings(): Promise<AppSettings>
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  getPreview(path: string): Promise<PreviewInfo>
  planCopy(jobs: QueueJob[]): Promise<CopyPlan>
  startCopy(request: CopyRequest): Promise<CopySummary>
  cancelCopy(batchId: string): Promise<void>
  onCopyProgress(listener: (progress: CopyProgress) => void): () => void
  startDuplicateScan(options: DuplicateScanOptions): Promise<string>
  cancelDuplicateScan(scanId: string): Promise<void>
  getDuplicateReport(scanId: string): Promise<DuplicateReport | null>
  onDuplicateProgress(listener: (progress: DuplicateScanProgress) => void): () => void
  applyDuplicateAction(request: DuplicateActionRequest): Promise<DuplicateActionResult>
  exportDuplicateReport(request: DuplicateExportRequest): Promise<string | null>
  getHistory(): Promise<HistoryEntry[]>
  clearHistory(): Promise<void>
  revealPath(path: string): Promise<void>
  openPath(path: string): Promise<void>
  getFreeSpace(path: string): Promise<number | null>
  getAppInfo(): Promise<AppInfo>
}

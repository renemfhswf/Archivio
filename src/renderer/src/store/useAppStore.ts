import { create } from 'zustand'
import { newestKeeper, suggestedKeeper } from '@shared/duplicates'
import { formatBytes } from '@shared/format'
import type {
  AppInfo,
  AppSettings,
  ConflictDecision,
  CopyPhase,
  CopyPlan,
  CopyProgress,
  CopySummary,
  DirListing,
  DuplicateReport,
  DuplicateScanProgress,
  FileEntry,
  HistoryEntry,
  PreviewInfo,
  QueueJob,
  RootEntry
} from '@shared/types'
import { newId } from '../lib/id'

export type View = 'sort' | 'duplicates' | 'history' | 'settings'
export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
  id: string
  kind: ToastKind
  message: string
}

export interface QueueItem {
  id: string
  sourcePath: string
  name: string
  size: number
  modifiedMs: number
  targetDir: string
}

interface DuplicateSelection {
  selected: Record<string, string[]>
  keepers: Record<string, string>
}

export interface AppState {
  view: View
  booted: boolean
  bootError: string | null
  settings: AppSettings | null
  roots: RootEntry[]
  appInfo: AppInfo | null
  sourcePath: string | null
  listing: DirListing | null
  listingLoading: boolean
  selectedPaths: string[]
  selectionAnchor: string | null
  preview: PreviewInfo | null
  previewLoading: boolean
  targetPath: string | null
  queue: QueueItem[]
  plan: CopyPlan | null
  copyRunning: boolean
  copyBatchId: string | null
  copyProgress: CopyProgress | null
  copyOutcomes: Record<string, CopyPhase>
  copySummary: CopySummary | null
  scanRunning: boolean
  scanId: string | null
  scanProgress: DuplicateScanProgress | null
  duplicateReport: DuplicateReport | null
  duplicateRoots: string[]
  duplicateMinSize: number
  duplicateIncludeHidden: boolean
  duplicateSelected: Record<string, string[]>
  duplicateKeepers: Record<string, string>
  actionRunning: boolean
  history: HistoryEntry[]
  toasts: Toast[]

  init: () => Promise<void>
  setView: (view: View) => void
  navigate: (path: string) => Promise<void>
  refresh: () => Promise<void>
  setTarget: (path: string | null) => void
  chooseTarget: () => Promise<void>
  select: (path: string, mode: 'single' | 'toggle') => void
  setSelection: (paths: string[], anchor?: string | null) => void
  selectAll: () => void
  clearSelection: () => void
  setPreview: (path: string | null) => Promise<void>
  addArchiveRoot: () => Promise<void>
  removeArchiveRoot: (path: string) => Promise<void>
  addSelectedToQueue: () => void
  addPathsToQueue: (paths: string[], targetDir: string) => void
  removeQueueItem: (id: string) => void
  clearQueue: () => void
  setQueueItemTarget: (id: string, targetDir: string) => void
  planAndCopy: () => Promise<void>
  executeCopy: (
    decisions: Record<string, ConflictDecision>,
    defaultDecision: ConflictDecision
  ) => Promise<void>
  cancelPlan: () => void
  cancelCopy: () => Promise<void>
  dismissCopySummary: () => void
  handleCopyProgress: (progress: CopyProgress) => void
  startScan: () => Promise<void>
  cancelScan: () => Promise<void>
  handleScanProgress: (progress: DuplicateScanProgress) => void
  loadReport: (scanId: string) => Promise<void>
  setDuplicateRoots: (roots: string[]) => void
  addDuplicateRoot: () => Promise<void>
  removeDuplicateRoot: (path: string) => void
  setDuplicateMinSize: (size: number) => void
  setDuplicateIncludeHidden: (value: boolean) => void
  resetDuplicateSelection: (rule: 'oldest' | 'newest') => void
  toggleDuplicateGroup: (groupId: string) => void
  toggleDuplicateFile: (groupId: string, path: string) => void
  setKeeper: (groupId: string, path: string) => void
  applyDuplicateAction: (
    disposition: 'quarantine' | 'trash' | 'delete',
    confirmToken?: string
  ) => Promise<void>
  exportReport: (format: 'csv' | 'json') => Promise<void>
  loadHistory: () => Promise<void>
  clearHistory: () => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  toast: (kind: ToastKind, message: string) => void
  dismissToast: (id: string) => void
}

let initialized = false
let navigationToken = 0
let previewToken = 0

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unbekannter Fehler'
}

function normalizeForCompare(path: string): string {
  return path.replace(/[\\/]+$/, '').toLocaleLowerCase('de-DE')
}

function isInside(child: string, parent: string): boolean {
  const normalizedChild = normalizeForCompare(child)
  const normalizedParent = normalizeForCompare(parent)
  if (normalizedChild === normalizedParent) return true
  return (
    normalizedChild.startsWith(normalizedParent) &&
    ['\\', '/'].includes(
      normalizedChild.charAt(normalizedParent.length)
    )
  )
}

function initialSelection(report: DuplicateReport): DuplicateSelection {
  const selected: Record<string, string[]> = {}
  const keepers: Record<string, string> = {}
  for (const group of report.groups) {
    const keeper = suggestedKeeper(group.files) ?? group.files[0]?.path
    if (!keeper) continue
    keepers[group.id] = keeper
    selected[group.id] = group.files
      .filter((file) => file.path !== keeper)
      .map((file) => file.path)
  }
  return { selected, keepers }
}

function preservedSelection(
  report: DuplicateReport,
  previousKeepers: Record<string, string>
): DuplicateSelection {
  const selected: Record<string, string[]> = {}
  const keepers: Record<string, string> = {}
  for (const group of report.groups) {
    const previous = previousKeepers[group.id]
    const keeper = group.files.some((file) => file.path === previous)
      ? (previous as string)
      : (suggestedKeeper(group.files) ?? group.files[0]?.path)
    if (!keeper) continue
    keepers[group.id] = keeper
    selected[group.id] = group.files
      .filter((file) => file.path !== keeper)
      .map((file) => file.path)
  }
  return { selected, keepers }
}

export const useAppStore = create<AppState>()((set, get) => {
  const syncPreview = (paths: string[]): void => {
    if (paths.length !== 1) {
      void get().setPreview(null)
      return
    }
    const entry = get().listing?.entries.find(
      (candidate) => candidate.path === paths[0]
    )
    if (!entry || entry.kind !== 'file') {
      void get().setPreview(null)
      return
    }
    void get().setPreview(entry.path)
  }

  return {
    view: 'sort',
    booted: false,
    bootError: null,
    settings: null,
    roots: [],
    appInfo: null,
    sourcePath: null,
    listing: null,
    listingLoading: false,
    selectedPaths: [],
    selectionAnchor: null,
    preview: null,
    previewLoading: false,
    targetPath: null,
    queue: [],
    plan: null,
    copyRunning: false,
    copyBatchId: null,
    copyProgress: null,
    copyOutcomes: {},
    copySummary: null,
    scanRunning: false,
    scanId: null,
    scanProgress: null,
    duplicateReport: null,
    duplicateRoots: [],
    duplicateMinSize: 1,
    duplicateIncludeHidden: false,
    duplicateSelected: {},
    duplicateKeepers: {},
    actionRunning: false,
    history: [],
    toasts: [],

    init: async () => {
      if (initialized) return
      initialized = true
      try {
        const [settings, roots, appInfo] = await Promise.all([
          window.archivio.getSettings(),
          window.archivio.getRoots(),
          window.archivio.getAppInfo()
        ])
        const preferredSource =
          settings.lastSourcePath ??
          roots.find((root) => root.kind === 'home')?.path ??
          roots[0]?.path ??
          null
        set({
          settings,
          roots,
          appInfo,
          booted: true,
          bootError: null,
          targetPath:
            settings.lastTargetPath ?? settings.archiveRoots[0] ?? null,
          duplicateRoots: settings.archiveRoots,
          duplicateMinSize: settings.scanMinSize,
          duplicateIncludeHidden: settings.scanIncludeHidden
        })
        if (preferredSource) {
          await get().navigate(preferredSource)
        }
      } catch (error) {
        set({
          booted: true,
          bootError: messageOf(error)
        })
        get().toast('error', `Start fehlgeschlagen: ${messageOf(error)}`)
      }
    },

    setView: (view) => {
      set({ view })
      if (view === 'history') void get().loadHistory()
    },

    navigate: async (path) => {
      const token = ++navigationToken
      set({
        sourcePath: path,
        listingLoading: true,
        selectedPaths: [],
        selectionAnchor: null,
        preview: null,
        previewLoading: false
      })
      try {
        const listing = await window.archivio.listDirectory(path)
        if (token !== navigationToken) return
        set({ listing, listingLoading: false })
        if (listing.error) {
          get().toast('error', `Ordner nicht lesbar: ${listing.error}`)
        }
        void get().updateSettings({ lastSourcePath: path })
      } catch (error) {
        if (token !== navigationToken) return
        set({ listingLoading: false })
        get().toast('error', `Ordner nicht lesbar: ${messageOf(error)}`)
      }
    },

    refresh: async () => {
      const path = get().sourcePath
      if (path) await get().navigate(path)
    },

    setTarget: (path) => {
      set({ targetPath: path })
      void get().updateSettings({ lastTargetPath: path })
    },

    chooseTarget: async () => {
      const current = get().settings
      try {
        const path = await window.archivio.chooseDirectory({
          title: 'Archivziel auswählen',
          defaultPath: get().targetPath ?? get().sourcePath
        })
        if (!path) return
        const roots = current?.archiveRoots ?? []
        const alreadyCovered = roots.some((root) => isInside(path, root))
        if (!alreadyCovered) {
          await get().updateSettings({
            archiveRoots: [...roots, path]
          })
        }
        get().setTarget(path)
        get().toast('success', 'Archivziel gesetzt.')
      } catch (error) {
        get().toast('error', messageOf(error))
      }
    },

    select: (path, mode) => {
      const current = get().selectedPaths
      let next: string[]
      if (mode === 'toggle') {
        next = current.includes(path)
          ? current.filter((entry) => entry !== path)
          : [...current, path]
      } else {
        next = [path]
      }
      set({ selectedPaths: next, selectionAnchor: path })
      syncPreview(next)
    },

    setSelection: (paths, anchor = null) => {
      set({
        selectedPaths: paths,
        selectionAnchor: anchor ?? paths[paths.length - 1] ?? null
      })
      syncPreview(paths)
    },

    selectAll: () => {
      const entries =
        get().listing?.entries.filter((entry) => entry.kind === 'file') ?? []
      const paths = entries.map((entry) => entry.path)
      set({ selectedPaths: paths, selectionAnchor: paths[0] ?? null })
      void get().setPreview(null)
    },

    clearSelection: () => {
      set({ selectedPaths: [], selectionAnchor: null })
      void get().setPreview(null)
    },

    setPreview: async (path) => {
      if (!path) {
        previewToken += 1
        set({ preview: null, previewLoading: false })
        return
      }
      const token = ++previewToken
      set({ previewLoading: true })
      try {
        const preview = await window.archivio.getPreview(path)
        if (token !== previewToken) return
        set({ preview, previewLoading: false })
      } catch (error) {
        if (token !== previewToken) return
        set({ preview: null, previewLoading: false })
        get().toast('error', `Vorschau fehlgeschlagen: ${messageOf(error)}`)
      }
    },

    addArchiveRoot: async () => {
      try {
        const path = await window.archivio.chooseDirectory({
          title: 'Archivordner hinzufügen',
          defaultPath: get().targetPath ?? get().sourcePath
        })
        if (!path) return
        const current = get().settings
        if (!current) return
        if (
          current.archiveRoots.some(
            (root) => normalizeForCompare(root) === normalizeForCompare(path)
          )
        ) {
          get().toast('info', 'Dieser Ordner ist bereits als Archivziel hinterlegt.')
          return
        }
        await get().updateSettings({
          archiveRoots: [...current.archiveRoots, path]
        })
        get().setTarget(path)
        get().toast('success', 'Archivordner hinzugefügt.')
      } catch (error) {
        get().toast('error', messageOf(error))
      }
    },

    removeArchiveRoot: async (path) => {
      const current = get().settings
      if (!current) return
      await get().updateSettings({
        archiveRoots: current.archiveRoots.filter(
          (root) => normalizeForCompare(root) !== normalizeForCompare(path)
        )
      })
      if (
        get().targetPath &&
        normalizeForCompare(get().targetPath as string) ===
          normalizeForCompare(path)
      ) {
        get().setTarget(null)
      }
      get().toast('info', 'Archivordner entfernt.')
    },

    addSelectedToQueue: () => {
      const target = get().targetPath
      if (!target) {
        get().toast('error', 'Bitte zuerst ein Archivziel auswählen.')
        return
      }
      const entries = get().listing?.entries ?? []
      const selected = entries.filter(
        (entry) =>
          entry.kind === 'file' && get().selectedPaths.includes(entry.path)
      )
      if (selected.length === 0) {
        get().toast('info', 'Keine Dateien ausgewählt.')
        return
      }
      const queue = [...get().queue]
      let added = 0
      for (const entry of selected) {
        const exists = queue.some(
          (item) =>
            normalizeForCompare(item.sourcePath) ===
              normalizeForCompare(entry.path) &&
            normalizeForCompare(item.targetDir) === normalizeForCompare(target)
        )
        if (exists) continue
        queue.push({
          id: newId(),
          sourcePath: entry.path,
          name: entry.name,
          size: entry.size,
          modifiedMs: entry.modifiedMs,
          targetDir: target
        })
        added += 1
      }
      set({ queue })
      get().toast(
        added > 0 ? 'success' : 'info',
        added > 0
          ? `${added} ${added === 1 ? 'Datei' : 'Dateien'} zur Ablage hinzugefügt.`
          : 'Die Auswahl liegt bereits in der Ablage.'
      )
    },

    addPathsToQueue: (paths, targetDir) => {
      const entries = get().listing?.entries ?? []
      const queue = [...get().queue]
      let added = 0
      for (const path of paths) {
        const entry = entries.find(
          (candidate) =>
            candidate.kind === 'file' &&
            normalizeForCompare(candidate.path) === normalizeForCompare(path)
        )
        if (!entry) continue
        const exists = queue.some(
          (item) =>
            normalizeForCompare(item.sourcePath) ===
              normalizeForCompare(entry.path) &&
            normalizeForCompare(item.targetDir) ===
              normalizeForCompare(targetDir)
        )
        if (exists) continue
        queue.push({
          id: newId(),
          sourcePath: entry.path,
          name: entry.name,
          size: entry.size,
          modifiedMs: entry.modifiedMs,
          targetDir
        })
        added += 1
      }
      set({ queue })
      if (added > 0) {
        get().toast(
          'success',
          `${added} ${added === 1 ? 'Datei' : 'Dateien'} zur Ablage hinzugefügt.`
        )
      }
    },

    removeQueueItem: (id) => {
      set({ queue: get().queue.filter((item) => item.id !== id) })
    },

    clearQueue: () => {
      if (get().copyRunning) {
        get().toast('error', 'Während des Kopierens kann die Ablage nicht geleert werden.')
        return
      }
      set({ queue: [], copySummary: null })
    },

    setQueueItemTarget: (id, targetDir) => {
      set({
        queue: get().queue.map((item) =>
          item.id === id ? { ...item, targetDir } : item
        )
      })
    },

    planAndCopy: async () => {
      const queue = get().queue
      if (queue.length === 0) {
        get().toast('info', 'Die Ablage ist leer.')
        return
      }
      if (get().copyRunning) return
      const settings = get().settings
      set({ copySummary: null, copyProgress: null, copyOutcomes: {} })
      try {
        const jobs: QueueJob[] = queue.map((item) => ({
          id: item.id,
          sourcePath: item.sourcePath,
          targetDir: item.targetDir
        }))
        const plan = await window.archivio.planCopy(jobs)
        const strategy = settings?.conflictStrategy ?? 'ask'
        if (plan.conflictCount > 0 && strategy === 'ask') {
          set({ plan })
          return
        }
        set({ plan })
        const decisions: Record<string, ConflictDecision> = {}
        if (strategy !== 'ask') {
          for (const conflict of plan.conflicts) {
            decisions[conflict.jobId] = strategy
          }
        }
        await get().executeCopy(
          decisions,
          strategy === 'ask' ? 'skip' : strategy
        )
      } catch (error) {
        set({ plan: null })
        get().toast('error', `Kopieren nicht möglich: ${messageOf(error)}`)
      }
    },

    executeCopy: async (decisions, defaultDecision) => {
      const plan = get().plan
      if (!plan) {
        get().toast('error', 'Der Kopierplan fehlt. Bitte erneut prüfen.')
        return
      }
      const settings = get().settings
      set({
        plan: null,
        copyRunning: true,
        copyProgress: null,
        copyBatchId: null,
        copyOutcomes: {}
      })
      try {
        const summary = await window.archivio.startCopy({
          planId: plan.id,
          decisions,
          defaultDecision,
          verify: settings?.verifyAfterCopy ?? true,
          preserveTimestamps: settings?.preserveTimestamps ?? true,
          concurrency: settings?.copyConcurrency ?? 2
        })
        const outcomes = get().copyOutcomes
        const remaining = get().queue.filter((item) => {
          const outcome = outcomes[item.id]
          return outcome !== 'done' && outcome !== 'skipped'
        })
        set({
          copyRunning: false,
          copyProgress: null,
          copyBatchId: null,
          copySummary: summary,
          queue: remaining
        })
        if (summary.cancelled) {
          get().toast(
            'info',
            `Kopieren abgebrochen. ${summary.copied} Dateien wurden kopiert.`
          )
        } else if (summary.failed > 0) {
          get().toast(
            'error',
            `${summary.copied} kopiert, ${summary.failed} fehlgeschlagen.`
          )
        } else {
          get().toast(
            'success',
            `${summary.copied} ${summary.copied === 1 ? 'Datei' : 'Dateien'} kopiert (${formatBytes(summary.bytes)}).`
          )
        }
      } catch (error) {
        set({ copyRunning: false, copyProgress: null, copyBatchId: null })
        get().toast('error', `Kopieren fehlgeschlagen: ${messageOf(error)}`)
      }
    },

    cancelPlan: () => set({ plan: null }),

    cancelCopy: async () => {
      const batchId = get().copyBatchId
      if (!batchId) return
      try {
        await window.archivio.cancelCopy(batchId)
        get().toast('info', 'Kopiervorgang wird abgebrochen …')
      } catch (error) {
        get().toast('error', messageOf(error))
      }
    },

    dismissCopySummary: () => set({ copySummary: null }),

    handleCopyProgress: (progress) => {
      const outcomes = { ...get().copyOutcomes }
      if (
        progress.phase === 'done' ||
        progress.phase === 'skipped' ||
        progress.phase === 'error'
      ) {
        outcomes[progress.jobId] = progress.phase
      }
      set({
        copyProgress: progress,
        copyBatchId: progress.batchId,
        copyOutcomes: outcomes
      })
    },

    startScan: async () => {
      if (get().scanRunning) return
      const roots = get().duplicateRoots
      if (roots.length === 0) {
        get().toast('error', 'Bitte mindestens einen Ordner für die Suche auswählen.')
        return
      }
      const settings = get().settings
      const minSize = get().duplicateMinSize
      const includeHidden = get().duplicateIncludeHidden
      set({
        scanRunning: true,
        scanProgress: null,
        scanId: null,
        duplicateReport: null,
        duplicateSelected: {},
        duplicateKeepers: {},
        preview: null
      })
      void get().updateSettings({
        scanMinSize: minSize,
        scanIncludeHidden: includeHidden
      })
      try {
        const scanId = await window.archivio.startDuplicateScan({
          roots,
          minSize,
          includeHidden,
          excludeNames: settings?.scanExcludeNames ?? []
        })
        set({ scanId })
      } catch (error) {
        set({ scanRunning: false })
        get().toast('error', `Suche fehlgeschlagen: ${messageOf(error)}`)
      }
    },

    cancelScan: async () => {
      const scanId = get().scanId
      if (!scanId) return
      try {
        await window.archivio.cancelDuplicateScan(scanId)
      } catch (error) {
        get().toast('error', messageOf(error))
      }
    },

    handleScanProgress: (progress) => {
      set({ scanProgress: progress })
      if (['done', 'cancelled', 'error'].includes(progress.phase)) {
        set({ scanRunning: false })
        void get().loadReport(progress.scanId)
      }
    },

    loadReport: async (scanId) => {
      try {
        const report = await window.archivio.getDuplicateReport(scanId)
        if (!report) return
        const selection = initialSelection(report)
        set({
          duplicateReport: report,
          duplicateSelected: selection.selected,
          duplicateKeepers: selection.keepers,
          scanId
        })
      } catch (error) {
        get().toast('error', `Bericht nicht verfügbar: ${messageOf(error)}`)
      }
    },

    setDuplicateRoots: (roots) => set({ duplicateRoots: roots }),

    addDuplicateRoot: async () => {
      try {
        const path = await window.archivio.chooseDirectory({
          title: 'Ordner für Duplikatsuche hinzufügen',
          defaultPath: get().duplicateRoots[0] ?? get().sourcePath
        })
        if (!path) return
        if (
          get().duplicateRoots.some(
            (root) => normalizeForCompare(root) === normalizeForCompare(path)
          )
        ) {
          return
        }
        set({ duplicateRoots: [...get().duplicateRoots, path] })
      } catch (error) {
        get().toast('error', messageOf(error))
      }
    },

    removeDuplicateRoot: (path) => {
      set({
        duplicateRoots: get().duplicateRoots.filter(
          (root) => normalizeForCompare(root) !== normalizeForCompare(path)
        )
      })
    },

    setDuplicateMinSize: (size) => set({ duplicateMinSize: size }),
    setDuplicateIncludeHidden: (value) =>
      set({ duplicateIncludeHidden: value }),

    resetDuplicateSelection: (rule) => {
      const report = get().duplicateReport
      if (!report) return
      const selected: Record<string, string[]> = {}
      const keepers: Record<string, string> = {}
      for (const group of report.groups) {
        const keeper =
          (rule === 'newest'
            ? newestKeeper(group.files)
            : suggestedKeeper(group.files)) ?? group.files[0]?.path
        if (!keeper) continue
        keepers[group.id] = keeper
        selected[group.id] = group.files
          .filter((file) => file.path !== keeper)
          .map((file) => file.path)
      }
      set({ duplicateSelected: selected, duplicateKeepers: keepers })
    },

    toggleDuplicateGroup: (groupId) => {
      const selected = { ...get().duplicateSelected }
      const keeper = get().duplicateKeepers[groupId]
      const group = get().duplicateReport?.groups.find(
        (candidate) => candidate.id === groupId
      )
      if (!group) return
      const all = group.files
        .filter((file) => file.path !== keeper)
        .map((file) => file.path)
      const current = selected[groupId] ?? []
      selected[groupId] = current.length === all.length ? [] : all
      set({ duplicateSelected: selected })
    },

    toggleDuplicateFile: (groupId, path) => {
      if (get().duplicateKeepers[groupId] === path) return
      const selected = { ...get().duplicateSelected }
      const current = selected[groupId] ?? []
      selected[groupId] = current.includes(path)
        ? current.filter((entry) => entry !== path)
        : [...current, path]
      set({ duplicateSelected: selected })
    },

    setKeeper: (groupId, path) => {
      const group = get().duplicateReport?.groups.find(
        (candidate) => candidate.id === groupId
      )
      if (!group) return
      const selected = { ...get().duplicateSelected }
      const keepers = { ...get().duplicateKeepers }
      keepers[groupId] = path
      selected[groupId] = group.files
        .filter((file) => file.path !== path)
        .map((file) => file.path)
      set({ duplicateSelected: selected, duplicateKeepers: keepers })
    },

    applyDuplicateAction: async (disposition, confirmToken) => {
      const report = get().duplicateReport
      if (!report) return
      if (get().actionRunning) return
      const selected = get().duplicateSelected
      const paths = Object.values(selected).flat()
      if (paths.length === 0) {
        get().toast('info', 'Es sind keine Dateien zum Entfernen ausgewählt.')
        return
      }
      let quarantineDir: string | null = null
      if (disposition === 'quarantine') {
        quarantineDir =
          get().settings?.quarantineDir ??
          get().appInfo?.quarantineDefault ??
          null
        if (!quarantineDir) {
          quarantineDir = await window.archivio.chooseDirectory({
            title: 'Quarantäneordner auswählen',
            defaultPath: get().duplicateRoots[0] ?? null
          })
          if (!quarantineDir) return
          await get().updateSettings({ quarantineDir })
        }
      }
      set({ actionRunning: true })
      try {
        const result = await window.archivio.applyDuplicateAction({
          scanId: report.id,
          disposition,
          filePaths: paths,
          quarantineDir,
          confirmToken:
            disposition === 'delete' ? (confirmToken ?? null) : null
        })
        const previousKeepers = get().duplicateKeepers
        const selection = preservedSelection(result.report, previousKeepers)
        set({
          duplicateReport: result.report,
          duplicateSelected: selection.selected,
          duplicateKeepers: selection.keepers,
          preview: null,
          actionRunning: false
        })
        get().toast(
          result.errors.length > 0 ? 'error' : 'success',
          `${result.removed} ${result.removed === 1 ? 'Datei' : 'Dateien'} entfernt, ${formatBytes(result.bytesFreed)} freigegeben.` +
            (result.errors.length > 0
              ? ` ${result.errors.length} Fehler.`
              : '')
        )
      } catch (error) {
        set({ actionRunning: false })
        get().toast('error', `Aktion fehlgeschlagen: ${messageOf(error)}`)
      }
    },

    exportReport: async (format) => {
      const report = get().duplicateReport
      if (!report) return
      try {
        const path = await window.archivio.exportDuplicateReport({
          scanId: report.id,
          format
        })
        if (path) get().toast('success', 'Bericht gespeichert.')
      } catch (error) {
        get().toast('error', `Export fehlgeschlagen: ${messageOf(error)}`)
      }
    },

    loadHistory: async () => {
      try {
        set({ history: await window.archivio.getHistory() })
      } catch (error) {
        get().toast('error', messageOf(error))
      }
    },

    clearHistory: async () => {
      try {
        await window.archivio.clearHistory()
        set({ history: [] })
        get().toast('info', 'Verlauf geleert.')
      } catch (error) {
        get().toast('error', messageOf(error))
      }
    },

    updateSettings: async (patch) => {
      const current = get().settings
      if (current) set({ settings: { ...current, ...patch } })
      try {
        const saved = await window.archivio.updateSettings(patch)
        set({ settings: saved })
        if (patch.archiveRoots) {
          set({ duplicateRoots: saved.archiveRoots })
        }
      } catch (error) {
        get().toast('error', `Einstellungen nicht gespeichert: ${messageOf(error)}`)
      }
    },

    toast: (kind, message) => {
      const id = newId()
      set({ toasts: [...get().toasts, { id, kind, message }] })
      window.setTimeout(
        () => get().dismissToast(id),
        kind === 'error' ? 8000 : 4500
      )
    },

    dismissToast: (id) => {
      set({ toasts: get().toasts.filter((toast) => toast.id !== id) })
    }
  }
})

export function selectedQueueEntries(
  entries: FileEntry[],
  selectedPaths: string[]
): FileEntry[] {
  return entries.filter(
    (entry) => entry.kind === 'file' && selectedPaths.includes(entry.path)
  )
}

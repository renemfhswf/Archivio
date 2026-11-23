import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  FileDown,
  FileJson,
  FolderInput,
  FolderSearch,
  Loader2,
  Plus,
  ScanSearch,
  ShieldCheck,
  Trash2,
  X
} from 'lucide-react'
import {
  formatBytes,
  formatCount,
  formatDateTime,
  shortenPath
} from '@shared/format'
import { useAppStore } from '../store/useAppStore'
import { DuplicateGroupCard } from './DuplicateGroupCard'
import { EmptyState } from './EmptyState'
import { Modal } from './Modal'
import { PreviewPane } from './PreviewPane'

const MIN_SIZE_OPTIONS = [
  { value: 0, label: 'Alle Größen' },
  { value: 1024, label: 'ab 1 KB' },
  { value: 10 * 1024, label: 'ab 10 KB' },
  { value: 100 * 1024, label: 'ab 100 KB' },
  { value: 1024 * 1024, label: 'ab 1 MB' }
]

function folderName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  if (parts.length === 0) return path
  const last = parts[parts.length - 1]
  if (/^[a-zA-Z]:$/.test(last)) return `${last}\\`
  return last
}

type PendingAction = 'quarantine' | 'trash' | 'delete'

export function DuplicatesView(): React.JSX.Element {
  const report = useAppStore((state) => state.duplicateReport)
  const roots = useAppStore((state) => state.duplicateRoots)
  const minSize = useAppStore((state) => state.duplicateMinSize)
  const includeHidden = useAppStore((state) => state.duplicateIncludeHidden)
  const scanRunning = useAppStore((state) => state.scanRunning)
  const scanProgress = useAppStore((state) => state.scanProgress)
  const duplicateSelected = useAppStore((state) => state.duplicateSelected)
  const duplicateKeepers = useAppStore((state) => state.duplicateKeepers)
  const actionRunning = useAppStore((state) => state.actionRunning)
  const preview = useAppStore((state) => state.preview)
  const settings = useAppStore((state) => state.settings)
  const appInfo = useAppStore((state) => state.appInfo)
  const addDuplicateRoot = useAppStore((state) => state.addDuplicateRoot)
  const removeDuplicateRoot = useAppStore((state) => state.removeDuplicateRoot)
  const setDuplicateMinSize = useAppStore((state) => state.setDuplicateMinSize)
  const setDuplicateIncludeHidden = useAppStore(
    (state) => state.setDuplicateIncludeHidden
  )
  const startScan = useAppStore((state) => state.startScan)
  const cancelScan = useAppStore((state) => state.cancelScan)
  const resetDuplicateSelection = useAppStore(
    (state) => state.resetDuplicateSelection
  )
  const toggleDuplicateGroup = useAppStore(
    (state) => state.toggleDuplicateGroup
  )
  const toggleDuplicateFile = useAppStore((state) => state.toggleDuplicateFile)
  const setKeeper = useAppStore((state) => state.setKeeper)
  const setPreview = useAppStore((state) => state.setPreview)
  const applyDuplicateAction = useAppStore(
    (state) => state.applyDuplicateAction
  )
  const exportReport = useAppStore((state) => state.exportReport)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const toast = useAppStore((state) => state.toast)

  const [visibleCount, setVisibleCount] = useState(40)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [deleteToken, setDeleteToken] = useState('')
  const [choosingDir, setChoosingDir] = useState(false)

  useEffect(() => {
    setVisibleCount(40)
  }, [report?.id])

  const selectedPaths = useMemo(
    () => Object.values(duplicateSelected).flat(),
    [duplicateSelected]
  )
  const selectedSet = useMemo(() => new Set(selectedPaths), [selectedPaths])
  const selectedBytes = useMemo(() => {
    if (!report) return 0
    let bytes = 0
    for (const group of report.groups) {
      bytes += group.files.filter((file) => selectedSet.has(file.path)).length * group.size
    }
    return bytes
  }, [report, selectedSet])

  const totalFiles =
    report?.groups.reduce((sum, group) => sum + group.files.length, 0) ?? 0

  const quarantineDir =
    settings?.quarantineDir ?? appInfo?.quarantineDefault ?? null

  const scanPercent =
    scanProgress?.phase === 'hashing' && scanProgress.hashTotal > 0
      ? Math.round((scanProgress.hashed / scanProgress.hashTotal) * 100)
      : null

  const minSizeOptions = useMemo(() => {
    if (MIN_SIZE_OPTIONS.some((option) => option.value === minSize)) {
      return MIN_SIZE_OPTIONS
    }
    return [
      ...MIN_SIZE_OPTIONS,
      { value: minSize, label: formatBytes(minSize) }
    ].sort((a, b) => a.value - b.value)
  }, [minSize])

  const openAction = (action: PendingAction): void => {
    if (selectedPaths.length === 0) {
      toast('info', 'Wähle zuerst Dateien aus, die entfernt werden sollen.')
      return
    }
    setDeleteToken('')
    setPendingAction(action)
  }

  const chooseQuarantineDir = async (): Promise<void> => {
    setChoosingDir(true)
    try {
      const path = await window.archivio.chooseDirectory({
        title: 'Quarantäneordner auswählen',
        defaultPath: quarantineDir ?? roots[0] ?? null
      })
      if (path) await updateSettings({ quarantineDir: path })
    } catch (error) {
      toast(
        'error',
        error instanceof Error ? error.message : 'Ordner konnte nicht gewählt werden.'
      )
    } finally {
      setChoosingDir(false)
    }
  }

  const confirmAction = (): void => {
    if (!pendingAction) return
    if (pendingAction === 'quarantine' && !quarantineDir) {
      toast('error', 'Bitte zuerst einen Quarantäneordner auswählen.')
      return
    }
    if (pendingAction === 'delete' && deleteToken !== 'LÖSCHEN') return
    const action = pendingAction
    const token = pendingAction === 'delete' ? deleteToken : undefined
    setPendingAction(null)
    void applyDuplicateAction(action, token)
  }

  const modalTitle =
    pendingAction === 'quarantine'
      ? 'In Quarantäne verschieben'
      : pendingAction === 'trash'
        ? 'In den Papierkorb verschieben'
        : 'Endgültig löschen'

  return (
    <div className="duplicates-view">
      <div className="duplicates-main">
        <div className="page-heading">
          <div>
            <h1>Duplikate finden</h1>
            <p>
              Durchsucht ausgewählte Ordner nach Dateien mit identischem Inhalt.
              Es wird nur gelesen – bis du eine Aktion bestätigst.
            </p>
          </div>
          <div className="page-heading-actions">
            <button
              type="button"
              className="button small ghost"
              onClick={() => void exportReport('csv')}
              disabled={!report || report.groups.length === 0}
            >
              <FileDown size={14} />
              CSV
            </button>
            <button
              type="button"
              className="button small ghost"
              onClick={() => void exportReport('json')}
              disabled={!report || report.groups.length === 0}
            >
              <FileJson size={14} />
              JSON
            </button>
          </div>
        </div>

        <section className="scan-card">
          <div className="scan-roots">
            {roots.length === 0 ? (
              <span className="muted">
                Noch keine Suchordner ausgewählt.
              </span>
            ) : (
              roots.map((root) => (
                <span key={root} className="root-chip" title={root}>
                  <FolderSearch size={13} />
                  <span>{folderName(root)}</span>
                  <button
                    type="button"
                    onClick={() => removeDuplicateRoot(root)}
                    aria-label={`${root} entfernen`}
                    disabled={scanRunning}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))
            )}
            <button
              type="button"
              className="button tiny ghost"
              onClick={() => void addDuplicateRoot()}
              disabled={scanRunning}
            >
              <Plus size={13} />
              Ordner
            </button>
          </div>

          <div className="scan-options">
            <label>
              Mindestgröße
              <select
                value={minSize}
                onChange={(event) =>
                  setDuplicateMinSize(Number(event.target.value))
                }
                disabled={scanRunning}
              >
                {minSizeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={includeHidden}
                onChange={(event) =>
                  setDuplicateIncludeHidden(event.target.checked)
                }
                disabled={scanRunning}
              />
              Versteckte Dateien einbeziehen
            </label>
            <span className="scan-excludes">
              Ausgeschlossen: {settings?.scanExcludeNames.slice(0, 4).join(', ')}
              {(settings?.scanExcludeNames.length ?? 0) > 4 ? ' …' : ''}
            </span>
            <span className="scan-spacer" />
            {scanRunning ? (
              <button
                type="button"
                className="button danger small"
                onClick={() => void cancelScan()}
              >
                <X size={14} />
                Suche abbrechen
              </button>
            ) : (
              <button
                type="button"
                className="button primary small"
                onClick={() => void startScan()}
                disabled={roots.length === 0}
              >
                <ScanSearch size={15} />
                Duplikate suchen
              </button>
            )}
          </div>

          {scanRunning || scanProgress ? (
            <div className="scan-progress">
              <div className="scan-progress-head">
                <span>
                  {scanProgress?.phase === 'hashing'
                    ? 'Dateien werden verglichen'
                    : 'Ordner werden durchsucht'}
                </span>
                <span>
                  {scanProgress?.phase === 'hashing'
                    ? `${formatCount(scanProgress.hashed)} / ${formatCount(scanProgress.hashTotal)}`
                    : `${formatCount(scanProgress?.scanned ?? 0)} Dateien`}
                </span>
              </div>
              <div
                className={`progress-bar ${scanPercent === null ? 'indeterminate' : ''}`}
              >
                <span
                  style={
                    scanPercent !== null
                      ? { width: `${scanPercent}%` }
                      : undefined
                  }
                />
              </div>
              <div className="scan-progress-detail">
                <span title={scanProgress?.currentPath ?? ''}>
                  {scanProgress?.currentPath
                    ? shortenPath(scanProgress.currentPath, 72)
                    : scanProgress?.message ?? 'Vorbereitung …'}
                </span>
                <span>
                  {formatCount(scanProgress?.groups ?? 0)} Gruppen
                </span>
              </div>
            </div>
          ) : null}
        </section>

        {report ? (
          <>
            <section className="duplicate-stats">
              <div className="stat-card">
                <span>Gruppen</span>
                <strong>{formatCount(report.groups.length)}</strong>
              </div>
              <div className="stat-card">
                <span>Dateien</span>
                <strong>{formatCount(totalFiles)}</strong>
              </div>
              <div className="stat-card">
                <span>Belegter Platz</span>
                <strong>{formatBytes(report.totalBytes)}</strong>
              </div>
              <div className="stat-card accent">
                <span>Einsparbar</span>
                <strong>{formatBytes(report.wastedBytes)}</strong>
              </div>
            </section>

            {report.errors.length > 0 ? (
              <details className="report-errors">
                <summary>
                  <AlertTriangle size={14} />
                  {report.errors.length} Dateien oder Ordner konnten nicht
                  gelesen werden
                </summary>
                <ul>
                  {report.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </details>
            ) : null}

            {report.phase === 'cancelled' ? (
              <div className="preview-notice">
                Die Suche wurde abgebrochen. Das Ergebnis ist unvollständig.
              </div>
            ) : null}

            <section className="duplicate-actions">
              <div className="selection-summary">
                <strong>{selectedPaths.length}</strong>
                <span>Dateien ausgewählt</span>
                <span className="muted">{formatBytes(selectedBytes)}</span>
              </div>
              <button
                type="button"
                className="button tiny ghost"
                onClick={() => resetDuplicateSelection('oldest')}
                disabled={report.groups.length === 0}
              >
                Älteste behalten
              </button>
              <button
                type="button"
                className="button tiny ghost"
                onClick={() => resetDuplicateSelection('newest')}
                disabled={report.groups.length === 0}
              >
                Neueste behalten
              </button>
              <span className="scan-spacer" />
              <button
                type="button"
                className="button tiny ghost"
                onClick={() => openAction('quarantine')}
                disabled={selectedPaths.length === 0 || actionRunning}
              >
                <FolderInput size={14} />
                Quarantäne
              </button>
              <button
                type="button"
                className="button tiny ghost"
                onClick={() => openAction('trash')}
                disabled={selectedPaths.length === 0 || actionRunning}
              >
                <Trash2 size={14} />
                Papierkorb
              </button>
              <button
                type="button"
                className="button tiny ghost danger-text"
                onClick={() => openAction('delete')}
                disabled={selectedPaths.length === 0 || actionRunning}
              >
                <AlertTriangle size={14} />
                Endgültig löschen
              </button>
              {actionRunning ? (
                <span className="inline-loading">
                  <Loader2 size={14} className="spin" />
                  Aktion läuft …
                </span>
              ) : null}
            </section>

            {report.groups.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck size={30} />}
                title={
                  report.phase === 'done'
                    ? 'Keine Duplikate gefunden'
                    : 'Noch kein Ergebnis'
                }
                description={
                  report.phase === 'done'
                    ? 'In den ausgewählten Ordnern wurde keine Datei mit identischem Inhalt gefunden.'
                    : 'Starte die Suche, um identische Dateien zu finden.'
                }
              />
            ) : (
              <div className="group-list">
                {report.groups
                  .slice(0, visibleCount)
                  .map((group, index) => (
                    <DuplicateGroupCard
                      key={group.id}
                      group={group}
                      index={index}
                      keeper={duplicateKeepers[group.id]}
                      selectedPaths={duplicateSelected[group.id] ?? []}
                      previewPath={preview?.path ?? null}
                      onToggleGroup={() => toggleDuplicateGroup(group.id)}
                      onToggleFile={(path) =>
                        toggleDuplicateFile(group.id, path)
                      }
                      onSetKeeper={(path) => setKeeper(group.id, path)}
                      onPreview={(path) => void setPreview(path)}
                    />
                  ))}
                {report.groups.length > visibleCount ? (
                  <button
                    type="button"
                    className="button ghost full"
                    onClick={() => setVisibleCount((current) => current + 40)}
                  >
                    Weitere {Math.min(40, report.groups.length - visibleCount)}{' '}
                    Gruppen anzeigen
                  </button>
                ) : null}
              </div>
            )}
          </>
        ) : !scanRunning ? (
          <EmptyState
            icon={<ScanSearch size={30} />}
            title="Bereit für die Duplikatsuche"
            description="Wähle oben die Ordner aus, die durchsucht werden sollen. Die Suche vergleicht Dateigröße und SHA-256-Prüfsumme."
          />
        ) : null}
      </div>

      <aside className="duplicates-preview">
        <PreviewPane />
      </aside>

      <Modal
        open={pendingAction !== null}
        title={modalTitle}
        subtitle={`${selectedPaths.length} Dateien · ${formatBytes(selectedBytes)}`}
        onClose={() => setPendingAction(null)}
        dismissible={!actionRunning}
        width={600}
        footer={
          <>
            <button
              type="button"
              className="button ghost"
              onClick={() => setPendingAction(null)}
              disabled={actionRunning}
            >
              Abbrechen
            </button>
            <button
              type="button"
              className={`button ${pendingAction === 'delete' ? 'danger' : 'primary'}`}
              onClick={confirmAction}
              disabled={
                actionRunning ||
                (pendingAction === 'delete' && deleteToken !== 'LÖSCHEN') ||
                (pendingAction === 'quarantine' && !quarantineDir)
              }
            >
              {actionRunning
                ? 'Bitte warten …'
                : pendingAction === 'quarantine'
                  ? 'Verschieben'
                  : pendingAction === 'trash'
                    ? 'In Papierkorb'
                    : 'Endgültig löschen'}
            </button>
          </>
        }
      >
        {pendingAction === 'quarantine' ? (
          <div className="action-dialog">
            <p>
              Die ausgewählten Dateien werden in den Quarantäneordner
              verschoben. Die Ordnerstruktur bleibt dabei erhalten. Das ist
              die sicherste Variante, weil nichts gelöscht wird.
            </p>
            <div className="quarantine-target">
              <FolderInput size={16} />
              <span title={quarantineDir ?? ''}>
                {quarantineDir ?? 'Noch kein Quarantäneordner gewählt'}
              </span>
              <button
                type="button"
                className="button tiny ghost"
                onClick={() => void chooseQuarantineDir()}
                disabled={choosingDir}
              >
                {choosingDir ? 'Wähle …' : 'Ordner wählen'}
              </button>
            </div>
            <p className="muted">
              Der aktuelle Vorschlag ist{' '}
              {appInfo?.quarantineDefault ?? 'ein Ordner deiner Wahl'}.
            </p>
          </div>
        ) : null}

        {pendingAction === 'trash' ? (
          <div className="action-dialog">
            <p>
              Die ausgewählten Dateien werden in den Windows-Papierkorb
              verschoben. Solange der Papierkorb nicht geleert wird, kannst du
              sie wiederherstellen.
            </p>
            <div className="action-note">
              <Trash2 size={16} />
              <span>
                Pro Duplikatgruppe bleibt die als „Behalten“ markierte Datei
                unangetastet.
              </span>
            </div>
          </div>
        ) : null}

        {pendingAction === 'delete' ? (
          <div className="action-dialog">
            <p className="danger-text">
              Diese Aktion löscht die ausgewählten Dateien endgültig. Sie
              landen nicht im Papierkorb und können nicht wiederhergestellt
              werden.
            </p>
            <label className="delete-confirm">
              Zum Bestätigen <strong>LÖSCHEN</strong> eingeben:
              <input
                value={deleteToken}
                onChange={(event) => setDeleteToken(event.target.value)}
                placeholder="LÖSCHEN"
                autoFocus
              />
            </label>
          </div>
        ) : null}

        <div className="action-file-list">
          {selectedPaths.slice(0, 8).map((path) => (
            <div key={path} title={path}>
              <span>{path.split(/[\\/]/).pop()}</span>
              <small>{shortenPath(path, 64)}</small>
            </div>
          ))}
          {selectedPaths.length > 8 ? (
            <p className="muted">
              … und {selectedPaths.length - 8} weitere Dateien
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}

import { useEffect, useState } from 'react'
import {
  Folder,
  FolderPlus,
  FolderSearch,
  HardDrive,
  Info,
  Plus,
  Trash2,
  X
} from 'lucide-react'
import { CONFLICT_STRATEGY_LABELS } from '@shared/constants'
import { formatBytes } from '@shared/format'
import type { ConflictStrategy, ThemeMode } from '@shared/types'
import { useAppStore } from '../store/useAppStore'

function folderName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  if (parts.length === 0) return path
  const last = parts[parts.length - 1]
  if (/^[a-zA-Z]:$/.test(last)) return `${last}\\`
  return last
}

export function SettingsView(): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const appInfo = useAppStore((state) => state.appInfo)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const addArchiveRoot = useAppStore((state) => state.addArchiveRoot)
  const removeArchiveRoot = useAppStore((state) => state.removeArchiveRoot)
  const toast = useAppStore((state) => state.toast)

  const [excludeText, setExcludeText] = useState('')
  const [previewKb, setPreviewKb] = useState('512')
  const [minSizeKb, setMinSizeKb] = useState('0')

  useEffect(() => {
    if (!settings) return
    setExcludeText(settings.scanExcludeNames.join('\n'))
    setPreviewKb(String(Math.round(settings.previewMaxBytes / 1024)))
    setMinSizeKb(String(Math.round(settings.scanMinSize / 1024)))
  }, [
    settings?.scanExcludeNames.join('\n'),
    settings?.previewMaxBytes,
    settings?.scanMinSize
  ])

  if (!settings) {
    return <div className="loading-state">Einstellungen werden geladen …</div>
  }

  const saveExcludes = (): void => {
    const names = excludeText
      .split(/[\n,;]+/)
      .map((name) => name.trim())
      .filter(Boolean)
    const unique = [...new Set(names.map((name) => name))]
    void updateSettings({ scanExcludeNames: unique })
  }

  const savePreview = (): void => {
    const kb = Number(previewKb)
    if (!Number.isFinite(kb)) {
      setPreviewKb(String(Math.round(settings.previewMaxBytes / 1024)))
      return
    }
    const clamped = Math.min(10240, Math.max(64, Math.round(kb)))
    setPreviewKb(String(clamped))
    void updateSettings({ previewMaxBytes: clamped * 1024 })
  }

  const saveMinSize = (): void => {
    const kb = Number(minSizeKb)
    if (!Number.isFinite(kb) || kb < 0) {
      setMinSizeKb(String(Math.round(settings.scanMinSize / 1024)))
      return
    }
    const bytes = Math.round(kb) * 1024
    setMinSizeKb(String(Math.round(kb)))
    void updateSettings({ scanMinSize: bytes })
  }

  const chooseQuarantine = async (): Promise<void> => {
    try {
      const path = await window.archivio.chooseDirectory({
        title: 'Quarantäneordner auswählen',
        defaultPath: settings.quarantineDir ?? settings.archiveRoots[0] ?? null
      })
      if (path) void updateSettings({ quarantineDir: path })
    } catch (error) {
      toast(
        'error',
        error instanceof Error ? error.message : 'Ordner konnte nicht gewählt werden.'
      )
    }
  }

  return (
    <div className="settings-view">
      <div className="page-heading">
        <div>
          <h1>Einstellungen</h1>
          <p>Änderungen werden sofort gespeichert.</p>
        </div>
      </div>

      <div className="settings-grid">
        <section className="settings-card wide">
          <div className="settings-card-head">
            <h2>
              <HardDrive size={18} />
              Archivziele
            </h2>
            <button
              type="button"
              className="button small primary"
              onClick={() => void addArchiveRoot()}
            >
              <Plus size={14} />
              Ordner hinzufügen
            </button>
          </div>
          <p className="settings-description">
            Diese Ordner erscheinen in der Seitenleiste als Ziele und werden
            für die Duplikatsuche vorgeschlagen. Es können auch Unterordner
            direkt als Ziel gewählt werden.
          </p>
          {settings.archiveRoots.length === 0 ? (
            <div className="settings-empty">
              <FolderPlus size={24} />
              <span>Noch kein Archivordner hinterlegt.</span>
            </div>
          ) : (
            <div className="root-list">
              {settings.archiveRoots.map((root) => (
                <div key={root} className="root-row">
                  <Folder size={16} />
                  <div>
                    <strong>{folderName(root)}</strong>
                    <span title={root}>{root}</span>
                  </div>
                  <button
                    type="button"
                    className="icon-button small"
                    onClick={() => void window.archivio.revealPath(root)}
                    title="Im Explorer zeigen"
                  >
                    <FolderSearch size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button small danger-text"
                    onClick={() => void removeArchiveRoot(root)}
                    title="Archivordner entfernen"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="settings-card">
          <h2>Kopieren</h2>
          <label className="settings-field">
            <span>Standard bei Konflikten</span>
            <select
              value={settings.conflictStrategy}
              onChange={(event) =>
                void updateSettings({
                  conflictStrategy: event.target.value as ConflictStrategy
                })
              }
            >
              {Object.entries(CONFLICT_STRATEGY_LABELS).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                )
              )}
            </select>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.verifyAfterCopy}
              onChange={(event) =>
                void updateSettings({
                  verifyAfterCopy: event.target.checked
                })
              }
            />
            Nach dem Kopieren Prüfsumme vergleichen
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.preserveTimestamps}
              onChange={(event) =>
                void updateSettings({
                  preserveTimestamps: event.target.checked
                })
              }
            />
            Änderungsdatum beibehalten
          </label>
          <label className="settings-field">
            <span>Gleichzeitige Kopien</span>
            <select
              value={settings.copyConcurrency}
              onChange={(event) =>
                void updateSettings({
                  copyConcurrency: Number(event.target.value)
                })
              }
            >
              {[1, 2, 3, 4].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <p className="settings-note">
            <Info size={14} />
            Kopien werden zunächst als temporäre Datei geschrieben und erst
            nach erfolgreicher Prüfung umbenannt. Vorhandene Dateien werden
            nur nach deiner Entscheidung ersetzt.
          </p>
        </section>

        <section className="settings-card">
          <h2>Duplikatsuche</h2>
          <label className="settings-field">
            <span>Mindestgröße (KB)</span>
            <input
              type="number"
              min={0}
              value={minSizeKb}
              onChange={(event) => setMinSizeKb(event.target.value)}
              onBlur={saveMinSize}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.scanIncludeHidden}
              onChange={(event) =>
                void updateSettings({
                  scanIncludeHidden: event.target.checked
                })
              }
            />
            Versteckte Dateien und Ordner einbeziehen
          </label>
          <label className="settings-field">
            <span>Ausgeschlossene Namen (eine pro Zeile)</span>
            <textarea
              rows={5}
              value={excludeText}
              onChange={(event) => setExcludeText(event.target.value)}
              onBlur={saveExcludes}
            />
          </label>
          <div className="settings-field">
            <span>Quarantäneordner</span>
            <div className="path-picker">
              <span title={settings.quarantineDir ?? ''}>
                {settings.quarantineDir ?? 'Nicht gesetzt'}
              </span>
              <button
                type="button"
                className="button tiny ghost"
                onClick={() => void chooseQuarantine()}
              >
                Wählen
              </button>
              {settings.quarantineDir ? (
                <button
                  type="button"
                  className="icon-button tiny"
                  onClick={() => void updateSettings({ quarantineDir: null })}
                  title="Quarantäneordner zurücksetzen"
                >
                  <X size={13} />
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="settings-card">
          <h2>Vorschau</h2>
          <label className="settings-field">
            <span>Maximale Textgröße (KB)</span>
            <input
              type="number"
              min={64}
              max={10240}
              value={previewKb}
              onChange={(event) => setPreviewKb(event.target.value)}
              onBlur={savePreview}
            />
          </label>
          <p className="settings-note">
            <Info size={14} />
            Aktuell: {formatBytes(settings.previewMaxBytes)}. Größere
            Textdateien werden gekürzt angezeigt. PDFs und Office-Dateien
            haben feste Sicherheitsgrenzen.
          </p>
        </section>

        <section className="settings-card">
          <h2>Darstellung</h2>
          <label className="settings-field">
            <span>Farbschema</span>
            <select
              value={settings.theme}
              onChange={(event) =>
                void updateSettings({
                  theme: event.target.value as ThemeMode
                })
              }
            >
              <option value="dark">Dunkel</option>
              <option value="light">Hell</option>
              <option value="system">Systemeinstellung</option>
            </select>
          </label>
        </section>

        <section className="settings-card wide">
          <h2>Daten &amp; Protokoll</h2>
          <div className="info-grid">
            <span>Version</span>
            <strong>{appInfo?.version ?? '–'}</strong>
            <span>Datenordner</span>
            <div className="info-path">
              <code>{appInfo?.dataDir ?? '–'}</code>
              {appInfo?.dataDir ? (
                <button
                  type="button"
                  className="button tiny ghost"
                  onClick={() => void window.archivio.revealPath(appInfo.dataDir)}
                >
                  Öffnen
                </button>
              ) : null}
            </div>
            <span>Protokoll</span>
            <div className="info-path">
              <code>{appInfo?.logFile ?? '–'}</code>
              {appInfo?.logFile ? (
                <button
                  type="button"
                  className="button tiny ghost"
                  onClick={() => void window.archivio.revealPath(appInfo.logFile)}
                >
                  Öffnen
                </button>
              ) : null}
            </div>
          </div>
          <p className="settings-note">
            <Trash2 size={14} />
            Archivio ändert oder löscht keine Quelldateien. Gelöscht wird nur
            nach ausdrücklicher Bestätigung im Duplikat-Bereich.
          </p>
        </section>
      </div>
    </div>
  )
}

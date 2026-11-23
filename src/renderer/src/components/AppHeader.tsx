import {
  Archive,
  CopyCheck,
  FolderInput,
  History,
  Loader2,
  Settings2
} from 'lucide-react'
import { formatCount } from '@shared/format'
import { useAppStore } from '../store/useAppStore'
import type { View } from '../store/useAppStore'

const NAV_ITEMS: Array<{
  id: View
  label: string
  icon: typeof FolderInput
}> = [
  { id: 'sort', label: 'Sortieren', icon: FolderInput },
  { id: 'duplicates', label: 'Duplikate', icon: CopyCheck },
  { id: 'history', label: 'Verlauf', icon: History },
  { id: 'settings', label: 'Einstellungen', icon: Settings2 }
]

export function AppHeader(): React.JSX.Element {
  const view = useAppStore((state) => state.view)
  const setView = useAppStore((state) => state.setView)
  const copyRunning = useAppStore((state) => state.copyRunning)
  const copyProgress = useAppStore((state) => state.copyProgress)
  const scanRunning = useAppStore((state) => state.scanRunning)
  const scanProgress = useAppStore((state) => state.scanProgress)

  const copyPercent =
    copyProgress && copyProgress.overallBytesTotal > 0
      ? Math.min(
          100,
          Math.round(
            (copyProgress.overallBytesDone /
              copyProgress.overallBytesTotal) *
              100
          )
        )
      : null

  const scanLabel =
    scanProgress?.phase === 'hashing'
      ? `${formatCount(scanProgress.hashed)} / ${formatCount(scanProgress.hashTotal)}`
      : scanProgress
        ? `${formatCount(scanProgress.scanned)} Dateien`
        : null

  return (
    <header className="app-header">
      <button
        type="button"
        className="brand"
        onClick={() => setView('sort')}
        title="Archivio – Start"
      >
        <span className="brand-mark">
          <Archive size={20} />
        </span>
        <span className="brand-text">
          <strong>Archivio</strong>
          <small>Dateien sortieren. Sicher ablegen.</small>
        </span>
      </button>

      <nav className="main-nav" aria-label="Hauptnavigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-button ${view === item.id ? 'active' : ''}`}
              onClick={() => setView(item.id)}
            >
              <Icon size={17} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="header-status">
        {copyRunning ? (
          <button
            type="button"
            className="operation-pill"
            onClick={() => setView('sort')}
            title="Kopiervorgang läuft"
          >
            <Loader2 size={14} className="spin" />
            <span>
              Kopiere … {copyPercent !== null ? `${copyPercent} %` : ''}
            </span>
            {copyPercent !== null ? (
              <span className="mini-progress">
                <span style={{ width: `${copyPercent}%` }} />
              </span>
            ) : null}
          </button>
        ) : null}
        {scanRunning ? (
          <button
            type="button"
            className="operation-pill"
            onClick={() => setView('duplicates')}
            title="Duplikatsuche läuft"
          >
            <Loader2 size={14} className="spin" />
            <span>Suche … {scanLabel ?? ''}</span>
          </button>
        ) : null}
      </div>
    </header>
  )
}

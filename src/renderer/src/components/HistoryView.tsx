import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Copy,
  FolderInput,
  History,
  ScanSearch,
  Trash2
} from 'lucide-react'
import { formatBytes, formatDateTime } from '@shared/format'
import type { HistoryType } from '@shared/types'
import { useAppStore } from '../store/useAppStore'
import { ConfirmDialog } from './ConfirmDialog'
import { EmptyState } from './EmptyState'

function entryIcon(type: HistoryType): React.JSX.Element {
  if (type === 'copy') return <Copy size={17} />
  if (type === 'quarantine') return <FolderInput size={17} />
  if (type === 'trash') return <Trash2 size={17} />
  if (type === 'delete') return <AlertTriangle size={17} />
  return <ScanSearch size={17} />
}

export function HistoryView(): React.JSX.Element {
  const history = useAppStore((state) => state.history)
  const loadHistory = useAppStore((state) => state.loadHistory)
  const clearHistory = useAppStore((state) => state.clearHistory)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  return (
    <div className="history-view">
      <div className="page-heading">
        <div>
          <h1>Verlauf</h1>
          <p>
            Kopiervorgänge und Duplikat-Aktionen der letzten Zeit. Der Verlauf
            dient der Nachvollziehbarkeit und lässt sich jederzeit leeren.
          </p>
        </div>
        <button
          type="button"
          className="button small ghost"
          onClick={() => setConfirmClear(true)}
          disabled={history.length === 0}
        >
          <Trash2 size={14} />
          Verlauf leeren
        </button>
      </div>

      {history.length === 0 ? (
        <EmptyState
          icon={<History size={30} />}
          title="Noch keine Einträge"
          description="Sobald du Dateien kopierst oder Duplikate bearbeitest, erscheinen die Vorgänge hier."
        />
      ) : (
        <div className="history-list">
          {history.map((entry) => (
            <article key={entry.id} className={`history-row ${entry.type}`}>
              <span className="history-icon">{entryIcon(entry.type)}</span>
              <div className="history-main">
                <strong>{entry.title}</strong>
                <span>{entry.detail}</span>
              </div>
              <div className="history-metrics">
                {entry.count > 0 ? (
                  <span>
                    {entry.count} {entry.count === 1 ? 'Datei' : 'Dateien'}
                  </span>
                ) : null}
                {entry.bytes > 0 ? (
                  <span>{formatBytes(entry.bytes)}</span>
                ) : null}
                {entry.errors > 0 ? (
                  <span className="error-text">
                    {entry.errors} Fehler
                  </span>
                ) : null}
              </div>
              <time dateTime={new Date(entry.timestamp).toISOString()}>
                {formatDateTime(entry.timestamp)}
              </time>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Verlauf leeren?"
        message="Die Einträge werden nur aus der Verlaufsliste entfernt. Kopierte oder gelöschte Dateien bleiben unverändert."
        confirmLabel="Verlauf leeren"
        danger
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false)
          void clearHistory()
        }}
      />
    </div>
  )
}

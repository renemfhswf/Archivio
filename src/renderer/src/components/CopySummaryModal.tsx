import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  SkipForward,
  Timer
} from 'lucide-react'
import { formatBytes, formatDuration } from '@shared/format'
import { useAppStore } from '../store/useAppStore'
import { Modal } from './Modal'

export function CopySummaryModal(): React.JSX.Element | null {
  const summary = useAppStore((state) => state.copySummary)
  const dismiss = useAppStore((state) => state.dismissCopySummary)

  if (!summary) return null

  return (
    <Modal
      open
      title={summary.cancelled ? 'Kopieren abgebrochen' : 'Kopiervorgang beendet'}
      subtitle={
        summary.failed > 0
          ? 'Einige Dateien konnten nicht kopiert werden und bleiben in der Ablage.'
          : 'Die Dateien wurden sicher in die Archivziele übernommen.'
      }
      onClose={dismiss}
      width={560}
      footer={
        <button type="button" className="button primary" onClick={dismiss}>
          Schließen
        </button>
      }
    >
      <div className="summary-grid">
        <div className="summary-card success">
          <Copy size={18} />
          <strong>{summary.copied}</strong>
          <span>kopiert</span>
        </div>
        <div className="summary-card">
          <SkipForward size={18} />
          <strong>{summary.skipped}</strong>
          <span>übersprungen</span>
        </div>
        <div className={`summary-card ${summary.failed > 0 ? 'error' : ''}`}>
          <AlertTriangle size={18} />
          <strong>{summary.failed}</strong>
          <span>Fehler</span>
        </div>
        <div className="summary-card">
          <Timer size={18} />
          <strong>{formatDuration(summary.durationMs)}</strong>
          <span>Dauer</span>
        </div>
      </div>

      <div className="summary-bytes">
        <CheckCircle2 size={16} />
        <span>
          {formatBytes(summary.bytes)} wurden geschrieben
          {summary.cancelled ? ' (vor dem Abbruch)' : ''}.
        </span>
      </div>

      {summary.errors.length > 0 ? (
        <div className="summary-errors">
          <h4>Fehlerdetails</h4>
          <ul>
            {summary.errors.map((error, index) => (
              <li key={`${error.jobId}-${index}`}>
                <span title={error.sourcePath}>
                  {error.sourcePath.split(/[\\/]/).pop() || error.sourcePath}
                </span>
                <small>{error.message}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Modal>
  )
}

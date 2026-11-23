import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Copy,
  FileWarning,
  ShieldAlert,
  SkipForward
} from 'lucide-react'
import { formatBytes, formatDateTime } from '@shared/format'
import type { ConflictDecision } from '@shared/types'
import { useAppStore } from '../store/useAppStore'
import { Modal } from './Modal'

export function CopyConflictModal(): React.JSX.Element | null {
  const plan = useAppStore((state) => state.plan)
  const cancelPlan = useAppStore((state) => state.cancelPlan)
  const executeCopy = useAppStore((state) => state.executeCopy)
  const [decisions, setDecisions] = useState<
    Record<string, ConflictDecision>
  >({})

  useEffect(() => {
    if (!plan) return
    const initial: Record<string, ConflictDecision> = {}
    for (const conflict of plan.conflicts) {
      initial[conflict.jobId] =
        conflict.kind === 'duplicate' ? 'skip' : 'rename'
    }
    setDecisions(initial)
  }, [plan])

  const errorItems = useMemo(
    () => plan?.items.filter((item) => item.status === 'error') ?? [],
    [plan]
  )

  if (!plan) return null

  const setAll = (decision: ConflictDecision): void => {
    const next: Record<string, ConflictDecision> = {}
    for (const conflict of plan.conflicts) {
      next[conflict.jobId] = decision
    }
    setDecisions(next)
  }

  return (
    <Modal
      open
      title="Zielkonflikte prüfen"
      subtitle={`${plan.readyCount} Dateien ohne Konflikt, ${plan.conflictCount} Konflikte, ${plan.errorCount} Fehler`}
      onClose={cancelPlan}
      width={780}
      className="conflict-modal"
      footer={
        <>
          <button
            type="button"
            className="button ghost"
            onClick={cancelPlan}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => void executeCopy(decisions, 'skip')}
          >
            <Copy size={15} />
            Kopieren starten
          </button>
        </>
      }
    >
      <div className="conflict-summary">
        <div>
          <strong>{plan.readyCount}</strong>
          <span>ohne Konflikt</span>
        </div>
        <div>
          <strong>{plan.conflictCount}</strong>
          <span>zu entscheiden</span>
        </div>
        <div>
          <strong>{formatBytes(plan.totalBytes)}</strong>
          <span>Gesamtgröße</span>
        </div>
      </div>

      {plan.conflictCount > 0 ? (
        <div className="conflict-bulk">
          <span>Schnellauswahl:</span>
          <button
            type="button"
            className="button tiny ghost"
            onClick={() => setAll('skip')}
          >
            <SkipForward size={13} />
            Alle überspringen
          </button>
          <button
            type="button"
            className="button tiny ghost"
            onClick={() => setAll('rename')}
          >
            Alle umbenennen
          </button>
          <button
            type="button"
            className="button tiny ghost danger-text"
            onClick={() => setAll('replace')}
          >
            Alle ersetzen
          </button>
        </div>
      ) : null}

      <div className="conflict-list">
        {plan.conflicts.map((conflict) => (
          <div
            key={conflict.jobId}
            className={`conflict-row ${conflict.kind}`}
          >
            <div className="conflict-kind">
              {conflict.kind === 'duplicate' ? (
                <ShieldAlert size={18} />
              ) : (
                <FileWarning size={18} />
              )}
              <div>
                <strong>
                  {conflict.kind === 'duplicate'
                    ? 'Identischer Inhalt'
                    : 'Name bereits vergeben'}
                </strong>
                <span>
                  {conflict.kind === 'duplicate'
                    ? 'Im Ziel liegt bereits eine Datei mit gleichem Inhalt.'
                    : 'Im Ziel liegt eine andere Datei mit gleichem Namen.'}
                </span>
              </div>
            </div>
            <div className="conflict-files">
              <div>
                <small>Quelle</small>
                <span title={conflict.sourcePath}>
                  {conflict.sourcePath.split(/[\\/]/).pop()}
                </span>
              </div>
              <div>
                <small>Vorhanden</small>
                <span title={conflict.existing.path}>
                  {formatBytes(conflict.existing.size)} ·{' '}
                  {formatDateTime(conflict.existing.modifiedMs)}
                </span>
              </div>
            </div>
            <div className="conflict-target" title={conflict.targetPath}>
              {conflict.targetPath}
            </div>
            <select
              value={decisions[conflict.jobId] ?? 'skip'}
              onChange={(event) =>
                setDecisions((current) => ({
                  ...current,
                  [conflict.jobId]: event.target
                    .value as ConflictDecision
                }))
              }
              aria-label="Entscheidung für diesen Konflikt"
            >
              <option value="skip">Überspringen</option>
              <option value="rename">Umbenennen</option>
              <option value="replace">Ersetzen</option>
            </select>
            {conflict.kind === 'duplicate' &&
            decisions[conflict.jobId] === 'replace' ? (
              <p className="conflict-warning">
                Ersetzen ist bei identischem Inhalt unnötig und überschreibt
                die vorhandene Datei.
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {errorItems.length > 0 ? (
        <div className="plan-errors">
          <h4>
            <AlertTriangle size={15} />
            {errorItems.length} Dateien können nicht kopiert werden
          </h4>
          <ul>
            {errorItems.map((item) => (
              <li key={item.jobId}>
                <span title={item.sourcePath}>{item.sourcePath}</span>
                <small>{item.error}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Modal>
  )
}

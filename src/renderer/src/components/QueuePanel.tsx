import {
  FolderInput,
  FolderOpen,
  Loader2,
  Play,
  Target,
  Trash2,
  X
} from 'lucide-react'
import { formatBytes, shortenPath } from '@shared/format'
import { useAppStore } from '../store/useAppStore'
import { EmptyState } from './EmptyState'
import { FileIcon } from './FileIcon'

export function QueuePanel(): React.JSX.Element {
  const queue = useAppStore((state) => state.queue)
  const targetPath = useAppStore((state) => state.targetPath)
  const chooseTarget = useAppStore((state) => state.chooseTarget)
  const removeQueueItem = useAppStore((state) => state.removeQueueItem)
  const clearQueue = useAppStore((state) => state.clearQueue)
  const setQueueItemTarget = useAppStore((state) => state.setQueueItemTarget)
  const planAndCopy = useAppStore((state) => state.planAndCopy)
  const copyRunning = useAppStore((state) => state.copyRunning)
  const copyProgress = useAppStore((state) => state.copyProgress)
  const cancelCopy = useAppStore((state) => state.cancelCopy)
  const toast = useAppStore((state) => state.toast)

  const totalBytes = queue.reduce((sum, item) => sum + item.size, 0)
  const targets = new Set(
    queue.map((item) => item.targetDir.toLocaleLowerCase('de-DE'))
  )
  const percent =
    copyProgress && copyProgress.overallBytesTotal > 0
      ? Math.min(
          100,
          Math.round(
            (copyProgress.overallBytesDone /
              copyProgress.overallBytesTotal) *
              100
          )
        )
      : 0

  const changeItemTarget = async (id: string, current: string): Promise<void> => {
    try {
      const path = await window.archivio.chooseDirectory({
        title: 'Zielordner für diese Datei',
        defaultPath: current
      })
      if (path) setQueueItemTarget(id, path)
    } catch (error) {
      toast(
        'error',
        error instanceof Error ? error.message : 'Ziel konnte nicht gesetzt werden.'
      )
    }
  }

  return (
    <section className="queue-panel">
      <div className="pane-heading">
        <span>
          Ablage
          {queue.length > 0 ? (
            <span className="pane-count">{queue.length}</span>
          ) : null}
        </span>
        {queue.length > 0 && !copyRunning ? (
          <button
            type="button"
            className="icon-button small"
            onClick={clearQueue}
            title="Ablage leeren"
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>

      <div className="queue-target">
        <Target size={14} />
        <div className="queue-target-text">
          <small>Ziel für neue Dateien</small>
          <span title={targetPath ?? ''}>
            {targetPath ? shortenPath(targetPath, 48) : 'Noch nicht gewählt'}
          </span>
        </div>
        <button
          type="button"
          className="button small ghost"
          onClick={() => void chooseTarget()}
        >
          Ändern
        </button>
      </div>

      <div className="queue-list">
        {queue.length === 0 ? (
          <EmptyState
            icon={<FolderInput size={26} />}
            title="Noch nichts in der Ablage"
            description="Wähle Dateien aus und klicke auf „Ablegen“ oder ziehe sie auf einen Zielordner."
            compact
          />
        ) : (
          queue.map((item) => (
            <div key={item.id} className="queue-item">
              <FileIcon name={item.name} kind="file" size={17} />
              <div className="queue-item-main">
                <strong title={item.name}>{item.name}</strong>
                <span title={item.targetDir}>
                  {shortenPath(item.targetDir, 44)}
                </span>
              </div>
              <span className="queue-item-size">{formatBytes(item.size)}</span>
              <button
                type="button"
                className="icon-button tiny"
                onClick={() => void changeItemTarget(item.id, item.targetDir)}
                title="Ziel für diese Datei ändern"
                disabled={copyRunning}
              >
                <FolderOpen size={13} />
              </button>
              <button
                type="button"
                className="icon-button tiny"
                onClick={() => removeQueueItem(item.id)}
                title="Aus Ablage entfernen"
                disabled={copyRunning}
              >
                <X size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="queue-footer">
        {copyRunning ? (
          <div className="copy-progress">
            <div className="copy-progress-head">
              <span>
                <Loader2 size={14} className="spin" />
                {copyProgress?.phase === 'verifying'
                  ? 'Prüfsumme wird verglichen'
                  : 'Wird kopiert'}
              </span>
              <strong>{percent} %</strong>
            </div>
            <div className="progress-bar">
              <span style={{ width: `${percent}%` }} />
            </div>
            <div className="copy-progress-detail">
              <span title={copyProgress?.fileName}>
                {copyProgress?.fileName ?? 'Vorbereitung …'}
              </span>
              <span>
                {copyProgress
                  ? `${copyProgress.fileIndex} / ${copyProgress.fileCount}`
                  : ''}
              </span>
            </div>
            <button
              type="button"
              className="button small danger full"
              onClick={() => void cancelCopy()}
            >
              Abbrechen
            </button>
          </div>
        ) : (
          <>
            <div className="queue-summary">
              <span>
                {queue.length} {queue.length === 1 ? 'Datei' : 'Dateien'}
              </span>
              <span>{formatBytes(totalBytes)}</span>
              {targets.size > 1 ? (
                <span className="muted">{targets.size} Ziele</span>
              ) : null}
            </div>
            <button
              type="button"
              className="button primary full"
              onClick={() => void planAndCopy()}
              disabled={queue.length === 0}
            >
              <Play size={15} />
              Kopieren starten
            </button>
            {!targetPath && queue.length > 0 ? (
              <p className="queue-hint">
                Bitte zuerst ein Archivziel auswählen.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}

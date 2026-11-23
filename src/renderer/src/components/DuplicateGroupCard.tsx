import { Eye, Files, ShieldCheck } from 'lucide-react'
import { newestKeeper, suggestedKeeper } from '@shared/duplicates'
import { formatBytes, formatDateTime } from '@shared/format'
import type { DuplicateGroup } from '@shared/types'
import { FileIcon } from './FileIcon'

interface DuplicateGroupCardProps {
  group: DuplicateGroup
  index: number
  keeper: string | undefined
  selectedPaths: string[]
  previewPath: string | null
  onToggleGroup: () => void
  onToggleFile: (path: string) => void
  onSetKeeper: (path: string) => void
  onPreview: (path: string) => void
}

export function DuplicateGroupCard({
  group,
  index,
  keeper,
  selectedPaths,
  previewPath,
  onToggleGroup,
  onToggleFile,
  onSetKeeper,
  onPreview
}: DuplicateGroupCardProps): React.JSX.Element {
  const selected = new Set(selectedPaths)
  const removable = group.files.filter((file) => file.path !== keeper)
  const allSelected =
    removable.length > 0 && removable.every((file) => selected.has(file.path))

  return (
    <article className="duplicate-group">
      <header className="group-head">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onToggleGroup}
          aria-label={`Gruppe ${index + 1} auswählen`}
        />
        <div className="group-title">
          <strong>Gruppe {index + 1}</strong>
          <span>
            <Files size={13} />
            {group.files.length} Dateien
          </span>
        </div>
        <div className="group-metrics">
          <span>{formatBytes(group.size)} je Datei</span>
          <span className="group-waste">
            {formatBytes(group.wastedBytes)} einsparbar
          </span>
        </div>
        <div className="group-actions">
          <button
            type="button"
            className="button tiny ghost"
            onClick={() => {
              const path = suggestedKeeper(group.files)
              if (path) onSetKeeper(path)
            }}
          >
            Älteste
          </button>
          <button
            type="button"
            className="button tiny ghost"
            onClick={() => {
              const path = newestKeeper(group.files)
              if (path) onSetKeeper(path)
            }}
          >
            Neueste
          </button>
        </div>
      </header>

      <div className="group-files">
        {group.files.map((file) => {
          const isKeeper = file.path === keeper
          return (
            <div
              key={file.path}
              className={`group-file ${isKeeper ? 'keeper' : ''} ${previewPath === file.path ? 'previewing' : ''}`}
              onClick={() => onPreview(file.path)}
              title={file.path}
            >
              <span className="keeper-cell">
                <input
                  type="radio"
                  name={`keeper-${group.id}`}
                  checked={isKeeper}
                  onChange={() => onSetKeeper(file.path)}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`${file.name} behalten`}
                />
              </span>
              <span className="remove-cell">
                <input
                  type="checkbox"
                  checked={!isKeeper && selected.has(file.path)}
                  disabled={isKeeper}
                  onChange={() => onToggleFile(file.path)}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`${file.name} zum Entfernen auswählen`}
                />
              </span>
              <FileIcon name={file.name} kind="file" size={17} />
              <div className="group-file-name">
                <strong>{file.name}</strong>
                <span>{file.dir}</span>
              </div>
              {isKeeper ? (
                <span className="keeper-badge">
                  <ShieldCheck size={12} />
                  Behalten
                </span>
              ) : null}
              <span className="group-file-date">
                {formatDateTime(file.modifiedMs)}
              </span>
              <span className="group-file-size">{formatBytes(file.size)}</span>
              <button
                type="button"
                className="icon-button tiny"
                onClick={(event) => {
                  event.stopPropagation()
                  onPreview(file.path)
                }}
                title="Vorschau anzeigen"
              >
                <Eye size={13} />
              </button>
            </div>
          )
        })}
      </div>
    </article>
  )
}

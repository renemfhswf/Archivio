import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ExternalLink,
  FileQuestion,
  FolderSearch,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  WrapText
} from 'lucide-react'
import { formatBytes, formatDateTime, shortenPath } from '@shared/format'
import { useAppStore } from '../store/useAppStore'
import { FileIcon } from './FileIcon'
import { PreviewDocx } from './PreviewDocx'
import { PreviewPdf } from './PreviewPdf'
import { PreviewXlsx } from './PreviewXlsx'

function PreviewText({
  text,
  truncated
}: {
  text: string
  truncated: boolean
}): React.JSX.Element {
  const [wrap, setWrap] = useState(true)
  return (
    <div className="text-preview">
      <div className="preview-subtoolbar">
        <button
          type="button"
          className={`button small ghost ${wrap ? 'active' : ''}`}
          onClick={() => setWrap((current) => !current)}
        >
          <WrapText size={14} />
          Zeilenumbruch
        </button>
        <span className="muted">
          {text.split(/\r?\n/).length} Zeilen
        </span>
      </div>
      {truncated ? (
        <div className="preview-notice">
          Die Datei ist größer als die Vorschau-Grenze. Es wird nur der Anfang
          angezeigt.
        </div>
      ) : null}
      <pre className={wrap ? 'wrap' : ''}>{text}</pre>
    </div>
  )
}

function PreviewImage({
  url,
  name
}: {
  url: string
  name: string
}): React.JSX.Element {
  const [zoom, setZoom] = useState(1)
  return (
    <div className="image-preview">
      <div className="preview-subtoolbar">
        <button
          type="button"
          className="icon-button small"
          onClick={() => setZoom((current) => Math.max(0.25, current - 0.25))}
          aria-label="Verkleinern"
        >
          <Minus size={14} />
        </button>
        <span className="zoom-label">{Math.round(zoom * 100)} %</span>
        <button
          type="button"
          className="icon-button small"
          onClick={() => setZoom((current) => Math.min(5, current + 0.25))}
          aria-label="Vergrößern"
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          className="button small ghost"
          onClick={() => setZoom(1)}
        >
          <RotateCcw size={13} />
          Zurücksetzen
        </button>
      </div>
      <div className="image-scroll">
        <img
          src={url}
          alt={name}
          style={{
            width: `${zoom * 100}%`,
            maxWidth: 'none',
            minWidth: zoom <= 1 ? '100%' : undefined
          }}
        />
      </div>
    </div>
  )
}

export function PreviewPane(): React.JSX.Element {
  const preview = useAppStore((state) => state.preview)
  const previewLoading = useAppStore((state) => state.previewLoading)
  const toast = useAppStore((state) => state.toast)
  const previewRef = useRef<HTMLDivElement>(null)

  const openExternally = (): void => {
    if (!preview) return
    void window.archivio.openPath(preview.path).catch((error: unknown) =>
      toast(
        'error',
        `Öffnen fehlgeschlagen: ${
          error instanceof Error ? error.message : 'Unbekannter Fehler'
        }`
      )
    )
  }

  const reveal = (): void => {
    if (!preview) return
    void window.archivio.revealPath(preview.path).catch((error: unknown) =>
      toast(
        'error',
        `Pfad konnte nicht geöffnet werden: ${
          error instanceof Error ? error.message : 'Unbekannter Fehler'
        }`
      )
    )
  }

  const copyPath = (): void => {
    if (!preview) return
    void navigator.clipboard
      .writeText(preview.path)
      .then(() => toast('success', 'Pfad kopiert.'))
      .catch(() => toast('error', 'Pfad konnte nicht kopiert werden.'))
  }

  return (
    <section className="preview-pane">
      <div className="pane-heading">
        <span>Vorschau</span>
        {preview ? (
          <div className="pane-heading-actions">
            <button
              type="button"
              className="icon-button small"
              onClick={copyPath}
              title="Pfad kopieren"
            >
              <FolderSearch size={14} />
            </button>
            <button
              type="button"
              className="icon-button small"
              onClick={reveal}
              title="Im Explorer zeigen"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        ) : null}
      </div>

      <div className="preview-body" ref={previewRef}>
        {previewLoading ? (
          <div className="loading-state">
            <Loader2 size={22} className="spin" />
            <span>Vorschau wird geladen …</span>
          </div>
        ) : !preview ? (
          <div className="preview-empty">
            <FileQuestion size={30} />
            <h3>Keine Datei ausgewählt</h3>
            <p>
              Wähle links eine Datei aus. Bilder, PDFs, Word- und
              Excel-Dateien sowie Texte werden hier angezeigt.
            </p>
          </div>
        ) : (
          <>
            <div className="preview-file-head">
              <FileIcon name={preview.name} kind="file" size={22} />
              <div className="preview-file-meta">
                <strong title={preview.name}>{preview.name}</strong>
                <span title={preview.path}>
                  {shortenPath(preview.path, 52)}
                </span>
                <small>
                  {formatBytes(preview.size)} ·{' '}
                  {formatDateTime(preview.modifiedMs)}
                </small>
              </div>
              <button
                type="button"
                className="button small ghost"
                onClick={openExternally}
                title="Mit Standardprogramm öffnen"
              >
                <ExternalLink size={14} />
                Öffnen
              </button>
            </div>

            <div className="preview-content" key={preview.path}>
              {preview.kind === 'image' && preview.url ? (
                <PreviewImage url={preview.url} name={preview.name} />
              ) : null}
              {preview.kind === 'pdf' && preview.url ? (
                <PreviewPdf url={preview.url} />
              ) : null}
              {preview.kind === 'docx' && preview.url ? (
                <PreviewDocx url={preview.url} />
              ) : null}
              {preview.kind === 'xlsx' && preview.url ? (
                <PreviewXlsx url={preview.url} />
              ) : null}
              {preview.kind === 'text' && preview.text !== null ? (
                <PreviewText
                  text={preview.text}
                  truncated={preview.truncated}
                />
              ) : null}
              {preview.kind === 'video' && preview.url ? (
                <div className="media-preview">
                  <video src={preview.url} controls preload="metadata" />
                </div>
              ) : null}
              {preview.kind === 'audio' && preview.url ? (
                <div className="media-preview audio">
                  <FileIcon name={preview.name} kind="file" size={40} />
                  <audio src={preview.url} controls preload="metadata" />
                </div>
              ) : null}
              {preview.kind === 'unsupported' ? (
                <div className="unsupported-preview">
                  <AlertTriangle size={28} />
                  <h3>Keine interne Vorschau</h3>
                  <p>{preview.reason}</p>
                  <button
                    type="button"
                    className="button primary small"
                    onClick={openExternally}
                  >
                    <ExternalLink size={14} />
                    Extern öffnen
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

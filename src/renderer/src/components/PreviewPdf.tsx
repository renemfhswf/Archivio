import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Minus, Plus, RotateCcw } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export function PreviewPdf({ url }: { url: string }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [fitScale, setFitScale] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [width, setWidth] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let loaded: PDFDocumentProxy | null = null
    setLoading(true)
    setError(null)
    setDoc(null)
    setPageNumber(1)
    setNumPages(0)
    setZoom(1)

    void fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`PDF konnte nicht geladen werden (${response.status}).`)
        }
        return response.arrayBuffer()
      })
      .then((buffer) =>
        pdfjsLib.getDocument({
          data: new Uint8Array(buffer),
          isEvalSupported: false
        }).promise
      )
      .then((document) => {
        if (cancelled) {
          void document.destroy()
          return
        }
        loaded = document
        setDoc(document)
        setNumPages(document.numPages)
        setLoading(false)
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setLoading(false)
        setError(
          reason instanceof Error
            ? reason.message
            : 'PDF konnte nicht geladen werden.'
        )
      })

    return () => {
      cancelled = true
      void loaded?.destroy()
    }
  }, [url])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width
      if (nextWidth) setWidth(nextWidth)
    })
    observer.observe(element)
    setWidth(element.clientWidth)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!doc || width <= 0) return
    let cancelled = false
    void doc.getPage(pageNumber).then((page) => {
      if (cancelled) return
      const viewport = page.getViewport({ scale: 1 })
      setFitScale(Math.max(0.2, (width - 36) / viewport.width))
    })
    return () => {
      cancelled = true
    }
  }, [doc, pageNumber, width])

  useEffect(() => {
    if (!doc || !canvasRef.current || fitScale <= 0) return
    let cancelled = false
    let task: ReturnType<PDFPageProxy['render']> | null = null

    void doc
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled) return
        const viewport = page.getViewport({ scale: fitScale * zoom })
        const canvas = canvasRef.current
        if (!canvas) return
        const ratio = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * ratio)
        canvas.height = Math.floor(viewport.height * ratio)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas nicht verfügbar.')
        task = page.render({
          canvasContext: context,
          viewport,
          transform:
            ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined
        })
        return task.promise
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        const name =
          reason && typeof reason === 'object' && 'name' in reason
            ? String((reason as { name?: string }).name)
            : ''
        if (name === 'RenderingCancelledException') return
        setError(
          reason instanceof Error
            ? reason.message
            : 'PDF-Seite konnte nicht dargestellt werden.'
        )
      })

    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, pageNumber, fitScale, zoom])

  if (loading) {
    return (
      <div className="loading-state">
        <Loader2 size={22} className="spin" />
        <span>PDF wird geladen …</span>
      </div>
    )
  }

  if (error) {
    return <div className="preview-error">{error}</div>
  }

  return (
    <div className="pdf-preview" ref={containerRef}>
      <div className="preview-subtoolbar pdf-toolbar">
        <button
          type="button"
          className="icon-button small"
          onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
          disabled={pageNumber <= 1}
          aria-label="Vorherige Seite"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="page-label">
          Seite {pageNumber} / {numPages || 1}
        </span>
        <button
          type="button"
          className="icon-button small"
          onClick={() =>
            setPageNumber((current) => Math.min(numPages, current + 1))
          }
          disabled={pageNumber >= numPages}
          aria-label="Nächste Seite"
        >
          <ChevronRight size={15} />
        </button>
        <span className="toolbar-separator" />
        <button
          type="button"
          className="icon-button small"
          onClick={() => setZoom((current) => Math.max(0.4, current - 0.2))}
          aria-label="Verkleinern"
        >
          <Minus size={14} />
        </button>
        <span className="zoom-label">{Math.round(zoom * 100)} %</span>
        <button
          type="button"
          className="icon-button small"
          onClick={() => setZoom((current) => Math.min(4, current + 0.2))}
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
          Anpassen
        </button>
      </div>
      <div className="pdf-canvas-scroll">
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}

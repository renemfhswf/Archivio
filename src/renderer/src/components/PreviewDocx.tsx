import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { renderAsync } from 'docx-preview'

export function PreviewDocx({ url }: { url: string }): React.JSX.Element {
  const bodyRef = useRef<HTMLDivElement>(null)
  const styleRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const body = bodyRef.current
    const style = styleRef.current
    if (!body) return
    setLoading(true)
    setError(null)
    body.innerHTML = ''
    if (style) style.innerHTML = ''

    void fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Word-Datei konnte nicht geladen werden (${response.status}).`
          )
        }
        return response.arrayBuffer()
      })
      .then((buffer) =>
        renderAsync(buffer, body, style ?? undefined, {
          className: 'docx',
          inWrapper: true,
          ignoreWidth: true,
          breakPages: true
        })
      )
      .then(() => {
        if (!cancelled) setLoading(false)
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setLoading(false)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Word-Datei konnte nicht dargestellt werden.'
        )
      })

    return () => {
      cancelled = true
      if (body) body.innerHTML = ''
      if (style) style.innerHTML = ''
    }
  }, [url])

  return (
    <div className="docx-preview">
      {loading ? (
        <div className="loading-state">
          <Loader2 size={22} className="spin" />
          <span>Word-Dokument wird dargestellt …</span>
        </div>
      ) : null}
      {error ? <div className="preview-error">{error}</div> : null}
      <div ref={styleRef} />
      <div ref={bodyRef} className="docx-body" />
    </div>
  )
}

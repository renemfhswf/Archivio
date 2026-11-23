import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import * as XLSX from 'xlsx'

const MAX_ROWS = 300
const MAX_COLUMNS = 40

function displayCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toLocaleString('de-DE')
  return String(value)
}

export function PreviewXlsx({ url }: { url: string }): React.JSX.Element {
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [activeSheet, setActiveSheet] = useState('')
  const [rows, setRows] = useState<string[][]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setWorkbook(null)
    setSheetNames([])
    setRows([])

    void fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Tabelle konnte nicht geladen werden (${response.status}).`
          )
        }
        return response.arrayBuffer()
      })
      .then((buffer) => {
        const parsed = XLSX.read(new Uint8Array(buffer), {
          type: 'array',
          cellDates: true
        })
        if (cancelled) return
        setWorkbook(parsed)
        setSheetNames(parsed.SheetNames)
        setActiveSheet(parsed.SheetNames[0] ?? '')
        setLoading(false)
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setLoading(false)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Tabelle konnte nicht dargestellt werden.'
        )
      })

    return () => {
      cancelled = true
    }
  }, [url])

  useEffect(() => {
    if (!workbook || !activeSheet) {
      setRows([])
      return
    }
    const sheet = workbook.Sheets[activeSheet]
    if (!sheet) {
      setRows([])
      return
    }
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false
    })
    const limitedRows = raw.slice(0, MAX_ROWS)
    const limited = limitedRows.map((row) =>
      Array.from({ length: Math.min(row.length, MAX_COLUMNS) }, (_, index) =>
        displayCell(row[index])
      )
    )
    setRows(limited)
    setTruncated(
      raw.length > MAX_ROWS ||
        limitedRows.some((row) => row.length > MAX_COLUMNS)
    )
  }, [workbook, activeSheet])

  if (loading) {
    return (
      <div className="loading-state">
        <Loader2 size={22} className="spin" />
        <span>Tabelle wird geladen …</span>
      </div>
    )
  }

  if (error) return <div className="preview-error">{error}</div>

  return (
    <div className="xlsx-preview">
      {sheetNames.length > 1 ? (
        <div className="sheet-tabs">
          {sheetNames.map((name) => (
            <button
              key={name}
              type="button"
              className={name === activeSheet ? 'active' : ''}
              onClick={() => setActiveSheet(name)}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}
      {truncated ? (
        <div className="preview-notice">
          Die Tabelle ist groß. Es werden maximal {MAX_ROWS} Zeilen und{' '}
          {MAX_COLUMNS} Spalten angezeigt.
        </div>
      ) : null}
      {rows.length === 0 ? (
        <div className="preview-error">Dieses Tabellenblatt ist leer.</div>
      ) : (
        <div className="sheet-scroll">
          <table>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <th className="row-number">{rowIndex + 1}</th>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={rowIndex === 0 ? 'header-cell' : ''}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

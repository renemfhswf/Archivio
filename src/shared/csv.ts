export function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  if (/[",\n\r;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function toCsv(rows: Array<Array<unknown>>, delimiter = ';'): string {
  return rows
    .map((row) => row.map(csvEscape).join(delimiter))
    .join('\r\n')
}

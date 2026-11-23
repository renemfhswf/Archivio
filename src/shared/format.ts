const numberFormat = new Intl.NumberFormat('de-DE', {
  maximumFractionDigits: 1
})

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '–'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  )
  const value = bytes / Math.pow(1024, exponent)
  const digits = exponent === 0 ? 0 : decimals
  return `${value.toLocaleString('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  })} ${units[exponent]}`
}

export function formatCount(value: number): string {
  return numberFormat.format(value)
}

export function formatDate(ms: number): string {
  if (!ms) return '–'
  return new Date(ms).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

export function formatDateTime(ms: number): string {
  if (!ms) return '–'
  return new Date(ms).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function formatTime(ms: number): string {
  if (!ms) return '–'
  return new Date(ms).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '–'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes < 60) return `${minutes} min ${rest} s`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${minutes % 60} min`
}

export function shortenPath(path: string, maxLength = 64): string {
  if (path.length <= maxLength) return path
  const separator = path.includes('\\') ? '\\' : '/'
  const parts = path.split(separator).filter(Boolean)
  if (parts.length <= 2) {
    return `…${path.slice(-(maxLength - 1))}`
  }
  const first = parts[0]
  let result = first
  for (let i = parts.length - 1; i > 0; i -= 1) {
    const candidate = `${result}${separator}…${separator}${parts.slice(i).join(separator)}`
    if (candidate.length > maxLength) break
    result = `${result}${separator}…${separator}${parts.slice(i).join(separator)}`
    break
  }
  return result.length <= maxLength
    ? result
    : `…${path.slice(-(maxLength - 1))}`
}

export function plural(
  count: number,
  singular: string,
  pluralForm: string
): string {
  return count === 1 ? singular : pluralForm
}

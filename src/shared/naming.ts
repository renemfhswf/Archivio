/**
 * Reine Namens- und Pfadhilfen, die auch im Renderer verwendet werden können.
 */

export interface NameParts {
  base: string
  extension: string
}

export function splitName(name: string): NameParts {
  const lastDot = name.lastIndexOf('.')
  if (lastDot <= 0 || lastDot === name.length - 1) {
    return { base: name, extension: '' }
  }
  return {
    base: name.slice(0, lastDot),
    extension: name.slice(lastDot)
  }
}

export function numberedName(name: string, number: number): string {
  if (number <= 1) return name
  const { base, extension } = splitName(name)
  return `${base} (${number})${extension}`
}

/**
 * Erzeugt aus einem vorhandenen Namen einen sicheren, eindeutigen
 * Alternativnamen. Die eigentliche Existenzprüfung übernimmt der Aufrufer.
 */
export function nextNumberedName(name: string, existing: Set<string>): string {
  const lower = new Set([...existing].map((entry) => entry.toLocaleLowerCase('de-DE')))
  if (!lower.has(name.toLocaleLowerCase('de-DE'))) return name
  for (let index = 2; index < 100000; index += 1) {
    const candidate = numberedName(name, index)
    if (!lower.has(candidate.toLocaleLowerCase('de-DE'))) return candidate
  }
  const { base, extension } = splitName(name)
  return `${base} (${Date.now()})${extension}`
}

export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
  const withoutReserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(
    cleaned
  )
    ? `_${cleaned}`
    : cleaned
  return withoutReserved || 'unbenannt'
}

export function isSamePath(
  a: string,
  b: string,
  platform: string = 'win32'
): boolean {
  if (platform === 'win32') {
    return a.replace(/\//g, '\\').toLocaleLowerCase('de-DE') ===
      b.replace(/\//g, '\\').toLocaleLowerCase('de-DE')
  }
  return a === b
}

export function extensionOf(name: string): string {
  const { extension } = splitName(name)
  return extension.slice(1).toLocaleLowerCase('de-DE')
}

export function parentPath(path: string): string | null {
  const normalized = path.replace(/[\\/]+$/, '')
  if (!normalized) return null
  const separatorIndex = Math.max(
    normalized.lastIndexOf('/'),
    normalized.lastIndexOf('\\')
  )
  if (separatorIndex < 0) return null
  if (separatorIndex === 0) return '/'
  if (/^[a-zA-Z]:$/.test(normalized.slice(0, separatorIndex))) {
    return `${normalized.slice(0, separatorIndex)}\\`
  }
  return normalized.slice(0, separatorIndex)
}

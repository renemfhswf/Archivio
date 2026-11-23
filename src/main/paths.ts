import { constants } from 'node:fs'
import { access, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, parse, relative, sep } from 'node:path'
import type { RootEntry } from '../shared/types'
import { sanitizeFileName } from '../shared/naming'

export function normalizePath(input: string): string {
  const normalized = input.replace(/[\\/]+$/, '')
  if (!normalized) return sep
  if (/^[a-zA-Z]:$/.test(normalized)) return `${normalized}\\`
  return normalized
}

export function pathKey(input: string): string {
  const normalized = normalizePath(input)
  return process.platform === 'win32'
    ? normalized.toLocaleLowerCase('de-DE')
    : normalized
}

export function assertAbsolutePath(input: unknown, label = 'Pfad'): string {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error(`${label} fehlt.`)
  }
  if (input.includes('\u0000')) {
    throw new Error(`${label} enthält ungültige Zeichen.`)
  }
  if (!isAbsolute(input)) {
    throw new Error(`${label} muss absolut sein.`)
  }
  return input
}

export function isSubPath(parent: string, child: string): boolean {
  const rel = relative(normalizePath(parent), normalizePath(child))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export function getParentPath(input: string): string | null {
  const normalized = normalizePath(input)
  const parent = dirname(normalized)
  if (pathKey(parent) === pathKey(normalized)) return null
  return parent
}

export function rootLabel(root: string): string {
  const parsed = parse(normalizePath(root))
  if (parsed.root === normalizePath(root) && parsed.root) {
    return parsed.root.replace(/[\\/:]+/g, '') || 'Laufwerk'
  }
  return sanitizeFileName(basename(normalizePath(root)) || 'Archiv')
}

export function relativeToRoot(
  filePath: string,
  roots: string[]
): { root: string; relativePath: string } | null {
  for (const root of roots) {
    if (isSubPath(root, filePath)) {
      return { root, relativePath: relative(root, filePath) }
    }
  }
  return null
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}

export async function getSystemRoots(): Promise<RootEntry[]> {
  const roots: RootEntry[] = []
  const seen = new Set<string>()

  const push = (entry: RootEntry): void => {
    const key = pathKey(entry.path)
    if (seen.has(key)) return
    seen.add(key)
    roots.push(entry)
  }

  if (process.platform === 'win32') {
    for (let code = 67; code <= 90; code += 1) {
      const letter = String.fromCharCode(code)
      const path = `${letter}:\\`
      if (await directoryExists(path)) {
        push({
          name: `${letter}:`,
          path,
          kind: 'drive',
          detail: 'Laufwerk'
        })
      }
    }
    const home = homedir()
    if (home) {
      push({ name: 'Benutzer', path: home, kind: 'home', detail: home })
    }
  } else {
    push({ name: 'Dateisystem', path: '/', kind: 'drive', detail: '/' })
    const home = homedir()
    if (home) {
      push({ name: 'Benutzer', path: home, kind: 'home', detail: home })
    }
    const user = basename(home)
    for (const base of [
      `/media/${user}`,
      `/run/media/${user}`,
      '/mnt',
      '/Volumes'
    ]) {
      try {
        const entries = await readdir(base, { withFileTypes: true })
        for (const entry of entries) {
          if (!entry.isDirectory() || entry.name.startsWith('.')) continue
          const path = join(base, entry.name)
          if (await directoryExists(path)) {
            push({
              name: entry.name,
              path,
              kind: 'volume',
              detail: base
            })
          }
        }
      } catch {
        // Optionaler Einhängepunkt ist nicht vorhanden.
      }
    }
  }

  return roots
}

import { open, lstat, readdir, stat, statfs } from 'node:fs/promises'
import { join } from 'node:path'
import {
  MAX_IMAGE_PREVIEW_BYTES,
  MAX_MEDIA_PREVIEW_BYTES,
  MAX_OFFICE_PREVIEW_BYTES,
  MAX_PDF_PREVIEW_BYTES
} from '../shared/constants'
import {
  fileTypeLabel,
  mimeForPath,
  previewKindForExtension
} from '../shared/fileTypes'
import { fileUrl } from '../shared/fileUrl'
import { extensionOf } from '../shared/naming'
import type { DirListing, FileEntry, PreviewInfo } from '../shared/types'
import { mapLimit } from './hash'
import { getParentPath } from './paths'

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unbekannter Fehler'
}

function sortEntries(entries: FileEntry[]): FileEntry[] {
  return entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name, 'de-DE', {
      numeric: true,
      sensitivity: 'base'
    })
  })
}

export async function listDirectory(target: string): Promise<DirListing> {
  try {
    const info = await stat(target)
    if (!info.isDirectory()) {
      throw new Error('Der Pfad ist kein Ordner.')
    }
    const dirents = await readdir(target, { withFileTypes: true })
    const entries = await mapLimit(dirents, 32, async (dirent) => {
      const fullPath = join(target, dirent.name)
      const extension = extensionOf(dirent.name)
      try {
        const entryInfo = await lstat(fullPath)
        const isDirectory =
          dirent.isDirectory() ||
          (dirent.isSymbolicLink() && entryInfo.isDirectory())
        const entry: FileEntry = {
          name: dirent.name,
          path: fullPath,
          kind: isDirectory ? 'directory' : 'file',
          size: entryInfo.size,
          modifiedMs: entryInfo.mtimeMs,
          createdMs: entryInfo.birthtimeMs || entryInfo.ctimeMs,
          extension,
          isSymlink: dirent.isSymbolicLink()
        }
        return entry
      } catch {
        return {
          name: dirent.name,
          path: fullPath,
          kind: dirent.isDirectory() ? 'directory' : 'file',
          size: 0,
          modifiedMs: 0,
          createdMs: 0,
          extension,
          isSymlink: dirent.isSymbolicLink()
        } satisfies FileEntry
      }
    })

    return {
      path: target,
      parent: getParentPath(target),
      entries: sortEntries(entries),
      error: null
    }
  } catch (error) {
    return {
      path: target,
      parent: getParentPath(target),
      entries: [],
      error: messageOf(error)
    }
  }
}

async function readTextPreview(
  path: string,
  size: number,
  maxBytes: number
): Promise<{ text: string | null; truncated: boolean; binary: boolean }> {
  const limit = Math.min(size, maxBytes)
  if (limit === 0) return { text: '', truncated: false, binary: false }
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(limit)
    const { bytesRead } = await handle.read(buffer, 0, limit, 0)
    const slice = buffer.subarray(0, bytesRead)
    if (slice.subarray(0, 8192).includes(0)) {
      return { text: null, truncated: size > bytesRead, binary: true }
    }
    if (slice.length >= 2 && slice[0] === 0xff && slice[1] === 0xfe) {
      return {
        text: slice.subarray(2).toString('utf16le'),
        truncated: size > bytesRead,
        binary: false
      }
    }
    if (slice.length >= 2 && slice[0] === 0xfe && slice[1] === 0xff) {
      const swapped = Buffer.from(slice.subarray(2))
      swapped.swap16()
      return {
        text: swapped.toString('utf16le'),
        truncated: size > bytesRead,
        binary: false
      }
    }
    const text = slice
      .toString('utf8')
      .replace(/^\uFEFF/, '')
      .replace(/\u0000/g, '')
    return { text, truncated: size > bytesRead, binary: false }
  } finally {
    await handle.close()
  }
}

function unsupportedReason(extension: string): string {
  if (extension === 'doc' || extension === 'ppt') {
    return 'Für dieses ältere Office-Format gibt es keine interne Vorschau. Bitte die Datei extern öffnen.'
  }
  if (extension === 'pptx' || extension === 'odp') {
    return 'Präsentationen werden noch nicht intern angezeigt. Bitte die Datei extern öffnen.'
  }
  if (['tif', 'tiff', 'heic', 'heif'].includes(extension)) {
    return 'Dieses Bildformat wird von der internen Vorschau nicht unterstützt.'
  }
  if (['zip', '7z', 'rar', 'tar', 'gz', 'bz2'].includes(extension)) {
    return 'Archive werden nicht entpackt. Bitte die Datei extern öffnen.'
  }
  return 'Für diesen Dateityp ist keine interne Vorschau verfügbar.'
}

export async function getPreview(
  target: string,
  maxTextBytes: number
): Promise<PreviewInfo> {
  const info = await stat(target)
  if (!info.isFile()) {
    throw new Error('Nur Dateien können in der Vorschau angezeigt werden.')
  }
  const name = target.split(/[\\/]/).pop() ?? target
  const extension = extensionOf(name)
  const kind = previewKindForExtension(extension)
  const base: PreviewInfo = {
    kind,
    path: target,
    name,
    size: info.size,
    modifiedMs: info.mtimeMs,
    mime: mimeForPath(target),
    extension,
    url: null,
    text: null,
    truncated: false,
    reason: null
  }

  if (kind === 'image') {
    if (info.size > MAX_IMAGE_PREVIEW_BYTES) {
      return {
        ...base,
        kind: 'unsupported',
        reason: 'Das Bild ist für die Vorschau zu groß (Grenze: 64 MB).'
      }
    }
    return { ...base, url: fileUrl(target) }
  }

  if (kind === 'pdf') {
    if (info.size > MAX_PDF_PREVIEW_BYTES) {
      return {
        ...base,
        kind: 'unsupported',
        reason: 'Das PDF ist für die Vorschau zu groß (Grenze: 128 MB).'
      }
    }
    return { ...base, url: fileUrl(target) }
  }

  if (kind === 'docx' || kind === 'xlsx') {
    if (info.size > MAX_OFFICE_PREVIEW_BYTES) {
      return {
        ...base,
        kind: 'unsupported',
        reason: 'Die Office-Datei ist für die Vorschau zu groß (Grenze: 64 MB).'
      }
    }
    return { ...base, url: fileUrl(target) }
  }

  if (kind === 'video' || kind === 'audio') {
    if (info.size > MAX_MEDIA_PREVIEW_BYTES) {
      return {
        ...base,
        kind: 'unsupported',
        reason: 'Die Mediendatei ist für die Vorschau zu groß.'
      }
    }
    return { ...base, url: fileUrl(target) }
  }

  if (kind === 'text') {
    const preview = await readTextPreview(target, info.size, maxTextBytes)
    if (preview.binary) {
      return {
        ...base,
        kind: 'unsupported',
        reason:
          'Die Datei wirkt binär und kann nicht als Text angezeigt werden.'
      }
    }
    return {
      ...base,
      text: preview.text,
      truncated: preview.truncated
    }
  }

  return {
    ...base,
    reason: unsupportedReason(extension)
  }
}

export async function getFreeSpace(path: string): Promise<number | null> {
  try {
    const info = await statfs(path)
    return Number(info.bavail) * Number(info.bsize)
  } catch {
    return null
  }
}

export function typeLabelFor(entry: FileEntry): string {
  return fileTypeLabel(entry.extension, entry.kind)
}

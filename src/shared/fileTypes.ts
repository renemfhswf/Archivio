import type { PreviewKind } from './types'
import { extensionOf } from './naming'

export const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'svg',
  'avif',
  'ico'
])

export const PDF_EXTENSIONS = new Set(['pdf'])

export const DOCX_EXTENSIONS = new Set(['docx', 'dotx'])

export const XLSX_EXTENSIONS = new Set([
  'xlsx',
  'xlsm',
  'xlsb',
  'xls',
  'ods'
])

export const TEXT_EXTENSIONS = new Set([
  'txt',
  'text',
  'md',
  'markdown',
  'mdx',
  'json',
  'jsonc',
  'json5',
  'xml',
  'yaml',
  'yml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'config',
  'log',
  'csv',
  'tsv',
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'tsx',
  'css',
  'scss',
  'less',
  'html',
  'htm',
  'sql',
  'py',
  'rb',
  'rs',
  'go',
  'java',
  'kt',
  'kts',
  'c',
  'h',
  'cpp',
  'hpp',
  'cc',
  'cs',
  'php',
  'sh',
  'bash',
  'zsh',
  'fish',
  'bat',
  'cmd',
  'ps1',
  'tex',
  'rtf',
  'env',
  'gitignore',
  'gitattributes',
  'editorconfig',
  'dockerignore',
  'properties',
  'gradle',
  'lua',
  'pl',
  'r',
  'swift',
  'vue',
  'svelte',
  'astro'
])

export const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'm4v',
  'webm',
  'ogv',
  'ogg',
  'mov',
  'mkv'
])

export const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'wav',
  'flac',
  'm4a',
  'aac',
  'oga',
  'opus',
  'weba'
])

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  ico: 'image/x-icon',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  dotx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  xlsb: 'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
  xls: 'application/vnd.ms-excel',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  weba: 'audio/webm',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  json: 'application/json; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  csv: 'text/csv; charset=utf-8'
}

export function extensionOfPath(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path
  return extensionOf(name)
}

export function previewKindForExtension(extension: string): PreviewKind {
  const ext = extension.toLocaleLowerCase('de-DE')
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (PDF_EXTENSIONS.has(ext)) return 'pdf'
  if (DOCX_EXTENSIONS.has(ext)) return 'docx'
  if (XLSX_EXTENSIONS.has(ext)) return 'xlsx'
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (TEXT_EXTENSIONS.has(ext)) return 'text'
  if (!ext) return 'text'
  return 'unsupported'
}

export function mimeForPath(path: string): string {
  const extension = extensionOfPath(path)
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream'
}

export function fileTypeLabel(extension: string, kind: 'file' | 'directory'): string {
  if (kind === 'directory') return 'Ordner'
  const ext = extension.toLocaleLowerCase('de-DE')
  if (!ext) return 'Datei'
  if (IMAGE_EXTENSIONS.has(ext)) return 'Bild'
  if (PDF_EXTENSIONS.has(ext)) return 'PDF-Dokument'
  if (DOCX_EXTENSIONS.has(ext)) return 'Word-Dokument'
  if (XLSX_EXTENSIONS.has(ext)) return 'Tabelle'
  if (VIDEO_EXTENSIONS.has(ext)) return 'Video'
  if (AUDIO_EXTENSIONS.has(ext)) return 'Audio'
  if (TEXT_EXTENSIONS.has(ext)) return 'Text'
  if (ext === 'doc') return 'Word (alt)'
  if (ext === 'ppt' || ext === 'pptx') return 'Präsentation'
  if (ext === 'zip' || ext === '7z' || ext === 'rar' || ext === 'tar' || ext === 'gz') {
    return 'Archiv'
  }
  return ext.toLocaleUpperCase('de-DE')
}

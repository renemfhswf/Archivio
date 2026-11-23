import {
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder
} from 'lucide-react'
import {
  AUDIO_EXTENSIONS,
  DOCX_EXTENSIONS,
  IMAGE_EXTENSIONS,
  PDF_EXTENSIONS,
  TEXT_EXTENSIONS,
  VIDEO_EXTENSIONS,
  XLSX_EXTENSIONS
} from '@shared/fileTypes'
import { extensionOf } from '@shared/naming'
import type { EntryKind } from '@shared/types'

interface FileIconProps {
  name: string
  kind: EntryKind
  size?: number
}

const ARCHIVE_EXTENSIONS = new Set([
  'zip',
  '7z',
  'rar',
  'tar',
  'gz',
  'bz2',
  'xz'
])

const CODE_EXTENSIONS = new Set([
  'js',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'jsx',
  'json',
  'html',
  'htm',
  'css',
  'scss',
  'py',
  'rs',
  'go',
  'java',
  'c',
  'h',
  'cpp',
  'cs',
  'php',
  'sh',
  'bat',
  'ps1',
  'sql'
])

export function FileIcon({
  name,
  kind,
  size = 18
}: FileIconProps): React.JSX.Element {
  if (kind === 'directory') {
    return <Folder size={size} className="file-icon icon-folder" />
  }
  const extension = extensionOf(name)
  if (IMAGE_EXTENSIONS.has(extension)) {
    return <FileImage size={size} className="file-icon icon-image" />
  }
  if (PDF_EXTENSIONS.has(extension)) {
    return <FileText size={size} className="file-icon icon-pdf" />
  }
  if (DOCX_EXTENSIONS.has(extension)) {
    return <FileText size={size} className="file-icon icon-doc" />
  }
  if (XLSX_EXTENSIONS.has(extension)) {
    return <FileSpreadsheet size={size} className="file-icon icon-sheet" />
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return <FileVideo size={size} className="file-icon icon-video" />
  }
  if (AUDIO_EXTENSIONS.has(extension)) {
    return <FileAudio size={size} className="file-icon icon-audio" />
  }
  if (CODE_EXTENSIONS.has(extension)) {
    return <FileCode2 size={size} className="file-icon icon-code" />
  }
  if (ARCHIVE_EXTENSIONS.has(extension)) {
    return <FileArchive size={size} className="file-icon icon-archive" />
  }
  if (TEXT_EXTENSIONS.has(extension)) {
    return <FileText size={size} className="file-icon icon-text" />
  }
  return <File size={size} className="file-icon icon-default" />
}

export const FILE_SCHEME = 'archivio-file'

/**
 * Baut eine URL für den eigenen Datei-Protokollhandler.
 * Der komplette Pfad wird prozentkodiert, damit auch Leerzeichen,
 * Umlaute und Windows-Laufwerksbuchstaben sicher übertragen werden.
 */
export function fileUrl(path: string): string {
  return `${FILE_SCHEME}://local/${encodeURIComponent(path)}`
}

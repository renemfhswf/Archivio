import type { ArchivioApi } from '../shared/types'

declare global {
  interface Window {
    archivio: ArchivioApi
  }
}

export {}

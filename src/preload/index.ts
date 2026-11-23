import { contextBridge, ipcRenderer } from 'electron'
import type {
  ArchivioApi,
  CopyProgress,
  DuplicateScanProgress
} from '../shared/types'

const api: ArchivioApi = {
  getRoots: () => ipcRenderer.invoke('fs:roots'),
  listDirectory: (path) => ipcRenderer.invoke('fs:list', path),
  chooseDirectory: (options) =>
    ipcRenderer.invoke('dialog:chooseDirectory', options),
  chooseDirectories: (options) =>
    ipcRenderer.invoke('dialog:chooseDirectories', options),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  getPreview: (path) => ipcRenderer.invoke('preview:get', path),
  planCopy: (jobs) => ipcRenderer.invoke('copy:plan', jobs),
  startCopy: (request) => ipcRenderer.invoke('copy:start', request),
  cancelCopy: (batchId) => ipcRenderer.invoke('copy:cancel', batchId),
  onCopyProgress: (listener) => {
    const handler = (_event: unknown, progress: CopyProgress): void => {
      listener(progress)
    }
    ipcRenderer.on('copy:progress', handler)
    return () => {
      ipcRenderer.removeListener('copy:progress', handler)
    }
  },
  startDuplicateScan: (options) =>
    ipcRenderer.invoke('duplicates:start', options),
  cancelDuplicateScan: (scanId) =>
    ipcRenderer.invoke('duplicates:cancel', scanId),
  getDuplicateReport: (scanId) =>
    ipcRenderer.invoke('duplicates:get', scanId),
  onDuplicateProgress: (listener) => {
    const handler = (
      _event: unknown,
      progress: DuplicateScanProgress
    ): void => {
      listener(progress)
    }
    ipcRenderer.on('duplicate:progress', handler)
    return () => {
      ipcRenderer.removeListener('duplicate:progress', handler)
    }
  },
  applyDuplicateAction: (request) =>
    ipcRenderer.invoke('duplicates:action', request),
  exportDuplicateReport: (request) =>
    ipcRenderer.invoke('duplicates:export', request),
  getHistory: () => ipcRenderer.invoke('history:get'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  revealPath: (path) => ipcRenderer.invoke('shell:reveal', path),
  openPath: (path) => ipcRenderer.invoke('shell:open', path),
  getFreeSpace: (path) => ipcRenderer.invoke('fs:freeSpace', path),
  getAppInfo: () => ipcRenderer.invoke('app:info')
}

contextBridge.exposeInMainWorld('archivio', api)

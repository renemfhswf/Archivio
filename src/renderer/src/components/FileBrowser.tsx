import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowUp,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FolderInput,
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
  Target,
  X
} from 'lucide-react'
import {
  formatBytes,
  formatCount,
  formatDateTime,
  shortenPath
} from '@shared/format'
import { fileTypeLabel } from '@shared/fileTypes'
import type { FileEntry } from '@shared/types'
import { useAppStore } from '../store/useAppStore'
import { EmptyState } from './EmptyState'
import { FileIcon } from './FileIcon'

const ROW_HEIGHT = 40
const OVERSCAN = 8

function buildBreadcrumb(path: string): Array<{ label: string; path: string }> {
  if (/^[a-zA-Z]:[\\/]/.test(path)) {
    const normalized = path.replace(/\//g, '\\')
    const parts = normalized.split('\\').filter(Boolean)
    const crumbs: Array<{ label: string; path: string }> = []
    let current = ''
    parts.forEach((part, index) => {
      if (index === 0) {
        current = `${part}\\`
        crumbs.push({ label: part, path: current })
      } else {
        current = `${current.replace(/\\$/, '')}\\${part}`
        crumbs.push({ label: part, path: current })
      }
    })
    return crumbs.length > 0 ? crumbs : [{ label: path, path }]
  }

  const parts = path.split('/').filter(Boolean)
  const crumbs: Array<{ label: string; path: string }> = [
    { label: '/', path: '/' }
  ]
  let current = ''
  for (const part of parts) {
    current += `/${part}`
    crumbs.push({ label: part, path: current })
  }
  return crumbs
}

type SortKey = 'name' | 'size' | 'modified' | 'type'

export function FileBrowser(): React.JSX.Element {
  const listing = useAppStore((state) => state.listing)
  const listingLoading = useAppStore((state) => state.listingLoading)
  const sourcePath = useAppStore((state) => state.sourcePath)
  const selectedPaths = useAppStore((state) => state.selectedPaths)
  const selectionAnchor = useAppStore((state) => state.selectionAnchor)
  const select = useAppStore((state) => state.select)
  const setSelection = useAppStore((state) => state.setSelection)
  const selectAll = useAppStore((state) => state.selectAll)
  const clearSelection = useAppStore((state) => state.clearSelection)
  const navigate = useAppStore((state) => state.navigate)
  const refresh = useAppStore((state) => state.refresh)
  const targetPath = useAppStore((state) => state.targetPath)
  const chooseTarget = useAppStore((state) => state.chooseTarget)
  const addSelectedToQueue = useAppStore((state) => state.addSelectedToQueue)
  const toast = useAppStore((state) => state.toast)

  const [filter, setFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(600)
  const [freeSpace, setFreeSpace] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setFilter('')
    setScrollTop(0)
    if (containerRef.current) containerRef.current.scrollTop = 0
  }, [sourcePath])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height
      if (height) setViewportHeight(height)
    })
    observer.observe(element)
    setViewportHeight(element.clientHeight)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!sourcePath) {
      setFreeSpace(null)
      return
    }
    let active = true
    void window.archivio
      .getFreeSpace(sourcePath)
      .then((space) => {
        if (active) setFreeSpace(space)
      })
      .catch(() => {
        if (active) setFreeSpace(null)
      })
    return () => {
      active = false
    }
  }, [sourcePath])

  const entries = listing?.entries ?? []

  const filtered = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase('de-DE')
    const result = query
      ? entries.filter((entry) =>
          entry.name.toLocaleLowerCase('de-DE').includes(query)
        )
      : [...entries]
    return result.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
      let comparison = 0
      if (sortKey === 'name') {
        comparison = a.name.localeCompare(b.name, 'de-DE', {
          numeric: true,
          sensitivity: 'base'
        })
      } else if (sortKey === 'size') {
        comparison = a.size - b.size
      } else if (sortKey === 'modified') {
        comparison = a.modifiedMs - b.modifiedMs
      } else {
        comparison = fileTypeLabel(a.extension, a.kind).localeCompare(
          fileTypeLabel(b.extension, b.kind),
          'de-DE'
        )
      }
      return sortDir === 'asc' ? comparison : -comparison
    })
  }, [entries, filter, sortKey, sortDir])

  const totalHeight = filtered.length * ROW_HEIGHT
  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN
  )
  const endIndex = Math.min(
    filtered.length,
    startIndex + Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2
  )
  const visible = filtered.slice(startIndex, endIndex)

  const selectedSet = useMemo(() => new Set(selectedPaths), [selectedPaths])
  const selectedEntries = entries.filter((entry) =>
    selectedSet.has(entry.path)
  )
  const selectedFiles = selectedEntries.filter(
    (entry) => entry.kind === 'file'
  )
  const selectedSize = selectedFiles.reduce(
    (sum, entry) => sum + entry.size,
    0
  )
  const fileCount = entries.filter((entry) => entry.kind === 'file').length
  const directoryCount = entries.length - fileCount
  const allFilteredFilesSelected =
    filtered.some((entry) => entry.kind === 'file') &&
    filtered
      .filter((entry) => entry.kind === 'file')
      .every((entry) => selectedSet.has(entry.path))

  const scrollToIndex = (index: number): void => {
    const container = containerRef.current
    if (!container) return
    const top = index * ROW_HEIGHT
    if (top < container.scrollTop) {
      container.scrollTop = top
    } else if (top + ROW_HEIGHT > container.scrollTop + container.clientHeight) {
      container.scrollTop = top - container.clientHeight + ROW_HEIGHT * 2
    }
  }

  const openEntry = (entry: FileEntry): void => {
    if (entry.kind === 'directory') {
      void navigate(entry.path)
      return
    }
    void window.archivio
      .openPath(entry.path)
      .catch((error: unknown) =>
        toast(
          'error',
          `Datei konnte nicht geöffnet werden: ${
            error instanceof Error ? error.message : 'Unbekannter Fehler'
          }`
        )
      )
  }

  const handleRowClick = (
    event: React.MouseEvent,
    entry: FileEntry
  ): void => {
    if (event.shiftKey && selectionAnchor) {
      const anchorIndex = filtered.findIndex(
        (candidate) => candidate.path === selectionAnchor
      )
      const currentIndex = filtered.findIndex(
        (candidate) => candidate.path === entry.path
      )
      if (anchorIndex >= 0 && currentIndex >= 0) {
        const from = Math.min(anchorIndex, currentIndex)
        const to = Math.max(anchorIndex, currentIndex)
        setSelection(
          filtered.slice(from, to + 1).map((candidate) => candidate.path),
          selectionAnchor
        )
        return
      }
    }
    if (event.ctrlKey || event.metaKey) {
      select(entry.path, 'toggle')
      return
    }
    select(entry.path, 'single')
  }

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    const target = event.target as HTMLElement
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

    const anchorIndex = selectionAnchor
      ? filtered.findIndex((entry) => entry.path === selectionAnchor)
      : -1
    const currentIndex = anchorIndex >= 0 ? anchorIndex : 0

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      selectAll()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (filtered.length === 0) return
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const next =
        anchorIndex < 0
          ? 0
          : Math.min(
              filtered.length - 1,
              Math.max(0, currentIndex + direction)
            )
      const entry = filtered[next]
      if (!entry) return
      select(entry.path, 'single')
      scrollToIndex(next)
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      if (filtered.length === 0) return
      const index = event.key === 'Home' ? 0 : filtered.length - 1
      const entry = filtered[index]
      if (!entry) return
      select(entry.path, 'single')
      scrollToIndex(index)
      return
    }
    if (event.key === 'Enter') {
      const entry = filtered.find((candidate) =>
        selectedSet.has(candidate.path)
      )
      if (entry) {
        event.preventDefault()
        openEntry(entry)
      }
      return
    }
    if (event.key === ' ') {
      event.preventDefault()
      return
    }
  }

  const toggleSort = (key: SortKey): void => {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortIndicator = (key: SortKey): React.JSX.Element | null => {
    if (sortKey !== key) return null
    return sortDir === 'asc' ? (
      <ChevronUp size={12} />
    ) : (
      <ChevronDown size={12} />
    )
  }

  return (
    <section className="file-browser">
      <div className="browser-toolbar">
        <button
          type="button"
          className="icon-button"
          onClick={() => {
            if (listing?.parent) void navigate(listing.parent)
          }}
          disabled={!listing?.parent}
          title="Übergeordneter Ordner"
        >
          <ArrowUp size={17} />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => void refresh()}
          title="Aktualisieren (F5)"
        >
          <RefreshCw size={16} />
        </button>

        <nav className="breadcrumb" aria-label="Pfad">
          {buildBreadcrumb(sourcePath ?? '').map((crumb, index, all) => (
            <span key={crumb.path} className="breadcrumb-part">
              <button
                type="button"
                className={index === all.length - 1 ? 'current' : ''}
                onClick={() => void navigate(crumb.path)}
                title={crumb.path}
              >
                {crumb.label}
              </button>
              {index < all.length - 1 ? (
                <ChevronRight size={13} className="breadcrumb-sep" />
              ) : null}
            </span>
          ))}
        </nav>

        <div className="filter-box">
          <Search size={15} />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filtern …"
            aria-label="Dateien filtern"
          />
          {filter ? (
            <button
              type="button"
              className="filter-clear"
              onClick={() => setFilter('')}
              aria-label="Filter löschen"
            >
              <X size={13} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="browser-selectionbar">
        <div className="selection-info">
          <CheckSquare size={15} />
          <span>
            {selectedPaths.length > 0
              ? `${selectedPaths.length} ausgewählt`
              : 'Nichts ausgewählt'}
          </span>
          {selectedFiles.length > 0 ? (
            <span className="muted">· {formatBytes(selectedSize)}</span>
          ) : null}
        </div>
        <div className="selection-actions">
          <button
            type="button"
            className="button small ghost"
            onClick={() =>
              allFilteredFilesSelected ? clearSelection() : selectAll()
            }
          >
            {allFilteredFilesSelected ? 'Auswahl aufheben' : 'Alles auswählen'}
          </button>
          <button
            type="button"
            className="target-chip"
            onClick={() => void chooseTarget()}
            title={targetPath ?? 'Kein Ziel gewählt'}
          >
            <Target size={14} />
            <span>
              {targetPath ? shortenPath(targetPath, 34) : 'Ziel wählen'}
            </span>
          </button>
          <button
            type="button"
            className="button primary small"
            onClick={addSelectedToQueue}
            disabled={selectedFiles.length === 0}
          >
            <FolderInput size={15} />
            Ablegen ({selectedFiles.length})
          </button>
        </div>
      </div>

      <div className="file-table-head">
        <span className="check-cell" />
        <button
          type="button"
          className="column-head name"
          onClick={() => toggleSort('name')}
        >
          Name {sortIndicator('name')}
        </button>
        <button
          type="button"
          className="column-head"
          onClick={() => toggleSort('size')}
        >
          Größe {sortIndicator('size')}
        </button>
        <button
          type="button"
          className="column-head"
          onClick={() => toggleSort('modified')}
        >
          Geändert {sortIndicator('modified')}
        </button>
        <button
          type="button"
          className="column-head"
          onClick={() => toggleSort('type')}
        >
          Typ {sortIndicator('type')}
        </button>
      </div>

      <div
        className="file-list-scroll"
        ref={containerRef}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="listbox"
        aria-label="Dateien"
        aria-multiselectable="true"
      >
        {listingLoading ? (
          <div className="loading-state">
            <Loader2 size={22} className="spin" />
            <span>Ordner wird gelesen …</span>
          </div>
        ) : listing?.error ? (
          <EmptyState
            icon={<AlertTriangle size={26} />}
            title="Ordner nicht lesbar"
            description={listing.error}
            compact
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FolderOpen size={26} />}
            title={filter ? 'Keine Treffer' : 'Dieser Ordner ist leer'}
            description={
              filter
                ? 'Der Filter passt auf keine Datei in diesem Ordner.'
                : 'Wähle links ein Laufwerk oder einen anderen Ordner.'
            }
            compact
          />
        ) : (
          <div style={{ height: totalHeight, position: 'relative' }}>
            {visible.map((entry, index) => {
              const absoluteIndex = startIndex + index
              const isSelected = selectedSet.has(entry.path)
              const isDirectory = entry.kind === 'directory'
              return (
                <div
                  key={entry.path}
                  className={`file-row ${isSelected ? 'selected' : ''} ${entry.name.startsWith('.') ? 'hidden-file' : ''}`}
                  style={{ top: absoluteIndex * ROW_HEIGHT }}
                  onClick={(event) => handleRowClick(event, entry)}
                  onDoubleClick={() => openEntry(entry)}
                  draggable={!isDirectory}
                  onDragStart={(event) => {
                    const paths = isSelected
                      ? selectedFiles.map((file) => file.path)
                      : [entry.path]
                    if (isDirectory || paths.length === 0) {
                      event.preventDefault()
                      return
                    }
                    event.dataTransfer.setData(
                      'application/x-archivio-paths',
                      JSON.stringify(paths)
                    )
                    event.dataTransfer.setData('text/plain', paths.join('\n'))
                    event.dataTransfer.effectAllowed = 'copy'
                  }}
                  role="option"
                  aria-selected={isSelected}
                  title={entry.path}
                >
                  <span className="check-cell">
                    {!isDirectory ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => select(entry.path, 'toggle')}
                        aria-label={`${entry.name} auswählen`}
                      />
                    ) : null}
                  </span>
                  <span className="file-name-cell">
                    <FileIcon name={entry.name} kind={entry.kind} />
                    <span className="file-name" title={entry.name}>
                      {entry.name}
                    </span>
                    {entry.isSymlink ? (
                      <span className="inline-badge">Link</span>
                    ) : null}
                  </span>
                  <span className="file-size">
                    {isDirectory ? '—' : formatBytes(entry.size)}
                  </span>
                  <span className="file-date">
                    {entry.modifiedMs
                      ? formatDateTime(entry.modifiedMs)
                      : '—'}
                  </span>
                  <span className="file-type">
                    {fileTypeLabel(entry.extension, entry.kind)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <footer className="browser-footer">
        <span>
          {formatCount(directoryCount)}{' '}
          {directoryCount === 1 ? 'Ordner' : 'Ordner'} ·{' '}
          {formatCount(fileCount)} {fileCount === 1 ? 'Datei' : 'Dateien'}
        </span>
        {selectedFiles.length > 0 ? (
          <span className="footer-selection">
            {selectedFiles.length} ausgewählt · {formatBytes(selectedSize)}
          </span>
        ) : null}
        <span className="footer-spacer" />
        {freeSpace !== null ? (
          <span className="footer-free">{formatBytes(freeSpace)} frei</span>
        ) : null}
      </footer>
    </section>
  )
}

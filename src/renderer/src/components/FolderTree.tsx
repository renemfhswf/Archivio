import { useCallback, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  HardDrive,
  Home,
  Loader2,
  AlertCircle
} from 'lucide-react'
import { SYSTEM_EXCLUDES } from '@shared/constants'
import type { FileEntry, RootKind } from '@shared/types'

export interface TreeRoot {
  name: string
  path: string
  kind?: RootKind | 'archive'
  detail?: string | null
}

interface FolderTreeProps {
  roots: TreeRoot[]
  mode: 'source' | 'target'
  selectedPath: string | null
  onSelect: (path: string) => void
  onDropPaths?: (paths: string[], targetDir: string) => void
  emptyLabel?: string
}

const EXCLUDED = new Set(
  SYSTEM_EXCLUDES.map((name) => name.toLocaleLowerCase('de-DE'))
)

function rootIcon(kind: TreeRoot['kind']): React.JSX.Element {
  if (kind === 'drive') return <HardDrive size={16} />
  if (kind === 'home') return <Home size={16} />
  if (kind === 'volume') return <HardDrive size={16} />
  return <FolderOpen size={16} />
}

interface NodeProps {
  entry: FileEntry
  depth: number
  mode: 'source' | 'target'
  selectedPath: string | null
  onSelect: (path: string) => void
  expanded: Record<string, boolean>
  children: Record<string, FileEntry[]>
  loading: Record<string, boolean>
  errors: Record<string, string>
  onToggle: (path: string) => void
  dropTarget: string | null
  setDropTarget: (path: string | null) => void
  onDropPaths?: (paths: string[], targetDir: string) => void
}

function TreeNode({
  entry,
  depth,
  mode,
  selectedPath,
  onSelect,
  expanded,
  children,
  loading,
  errors,
  onToggle,
  dropTarget,
  setDropTarget,
  onDropPaths
}: NodeProps): React.JSX.Element {
  const isExpanded = Boolean(expanded[entry.path])
  const isSelected = selectedPath === entry.path
  const isDropTarget = dropTarget === entry.path && mode === 'target'
  const childEntries = children[entry.path]

  return (
    <div className="tree-node">
      <div
        className={`tree-row ${isSelected ? 'selected' : ''} ${isDropTarget ? 'drop-target' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onSelect(entry.path)}
        onDoubleClick={() => onToggle(entry.path)}
        onDragOver={(event) => {
          if (mode !== 'target' || !onDropPaths) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          setDropTarget(entry.path)
        }}
        onDragLeave={(event) => {
          if (
            event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            return
          }
          if (dropTarget === entry.path) setDropTarget(null)
        }}
        onDrop={(event) => {
          if (mode !== 'target' || !onDropPaths) return
          event.preventDefault()
          setDropTarget(null)
          const raw = event.dataTransfer.getData(
            'application/x-archivio-paths'
          )
          if (!raw) return
          try {
            const parsed = JSON.parse(raw) as unknown
            if (Array.isArray(parsed)) {
              const paths = parsed.filter(
                (value): value is string => typeof value === 'string'
              )
              if (paths.length > 0) onDropPaths(paths, entry.path)
            }
          } catch {
            // Ungültige Drag-Daten ignorieren.
          }
        }}
        title={entry.path}
      >
        <button
          type="button"
          className="tree-chevron"
          onClick={(event) => {
            event.stopPropagation()
            onToggle(entry.path)
          }}
          aria-label={isExpanded ? 'Ordner zuklappen' : 'Ordner aufklappen'}
        >
          {loading[entry.path] ? (
            <Loader2 size={13} className="spin" />
          ) : isExpanded ? (
            <ChevronDown size={14} />
          ) : (
            <ChevronRight size={14} />
          )}
        </button>
        {isExpanded ? (
          <FolderOpen size={16} className="tree-folder-icon" />
        ) : (
          <Folder size={16} className="tree-folder-icon" />
        )}
        <span className="tree-label">{entry.name}</span>
        {entry.isSymlink ? <span className="tree-badge">Link</span> : null}
      </div>
      {errors[entry.path] ? (
        <div
          className="tree-error"
          style={{ paddingLeft: 30 + depth * 14 }}
        >
          <AlertCircle size={12} />
          <span>Kein Zugriff</span>
        </div>
      ) : null}
      {isExpanded && childEntries ? (
        <div className="tree-children">
          {childEntries.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              mode={mode}
              selectedPath={selectedPath}
              onSelect={onSelect}
              expanded={expanded}
              children={children}
              loading={loading}
              errors={errors}
              onToggle={onToggle}
              dropTarget={dropTarget}
              setDropTarget={setDropTarget}
              onDropPaths={onDropPaths}
            />
          ))}
          {childEntries.length === 0 ? (
            <div
              className="tree-empty"
              style={{ paddingLeft: 34 + depth * 14 }}
            >
              Keine Unterordner
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function FolderTree({
  roots,
  mode,
  selectedPath,
  onSelect,
  onDropPaths,
  emptyLabel = 'Keine Ordner'
}: FolderTreeProps): React.JSX.Element {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [children, setChildren] = useState<Record<string, FileEntry[]>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const load = useCallback(
    async (path: string): Promise<void> => {
      if (children[path] || loading[path]) return
      setLoading((current) => ({ ...current, [path]: true }))
      try {
        const listing = await window.archivio.listDirectory(path)
        const directories = listing.entries.filter(
          (entry) =>
            entry.kind === 'directory' &&
            !EXCLUDED.has(entry.name.toLocaleLowerCase('de-DE'))
        )
        setChildren((current) => ({ ...current, [path]: directories }))
        setErrors((current) => {
          const next = { ...current }
          if (listing.error) next[path] = listing.error
          else delete next[path]
          return next
        })
      } catch (error) {
        setErrors((current) => ({
          ...current,
          [path]: error instanceof Error ? error.message : 'Fehler'
        }))
      } finally {
        setLoading((current) => ({ ...current, [path]: false }))
      }
    },
    [children, loading]
  )

  const toggle = useCallback(
    (path: string): void => {
      setExpanded((current) => {
        const next = { ...current, [path]: !current[path] }
        if (next[path]) void load(path)
        return next
      })
    },
    [load]
  )

  if (roots.length === 0) {
    return <div className="tree-empty-state">{emptyLabel}</div>
  }

  return (
    <div className={`folder-tree ${mode}`}>
      {roots.map((root) => {
        const isExpanded = Boolean(expanded[root.path])
        const isSelected = selectedPath === root.path
        const isDropTarget = dropTarget === root.path && mode === 'target'
        const childEntries = children[root.path]
        return (
          <div key={root.path} className="tree-root">
            <div
              className={`tree-row root ${isSelected ? 'selected' : ''} ${isDropTarget ? 'drop-target' : ''}`}
              style={{ paddingLeft: 8 }}
              onClick={() => onSelect(root.path)}
              onDoubleClick={() => toggle(root.path)}
              onDragOver={(event) => {
                if (mode !== 'target' || !onDropPaths) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'copy'
                setDropTarget(root.path)
              }}
              onDragLeave={(event) => {
                if (
                  event.currentTarget.contains(
                    event.relatedTarget as Node | null
                  )
                ) {
                  return
                }
                if (dropTarget === root.path) setDropTarget(null)
              }}
              onDrop={(event) => {
                if (mode !== 'target' || !onDropPaths) return
                event.preventDefault()
                setDropTarget(null)
                const raw = event.dataTransfer.getData(
                  'application/x-archivio-paths'
                )
                if (!raw) return
                try {
                  const parsed = JSON.parse(raw) as unknown
                  if (Array.isArray(parsed)) {
                    const paths = parsed.filter(
                      (value): value is string => typeof value === 'string'
                    )
                    if (paths.length > 0) onDropPaths(paths, root.path)
                  }
                } catch {
                  // Ungültige Drag-Daten ignorieren.
                }
              }}
              title={root.path}
            >
              <button
                type="button"
                className="tree-chevron"
                onClick={(event) => {
                  event.stopPropagation()
                  toggle(root.path)
                }}
                aria-label={
                  isExpanded ? 'Ordner zuklappen' : 'Ordner aufklappen'
                }
              >
                {loading[root.path] ? (
                  <Loader2 size={13} className="spin" />
                ) : isExpanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </button>
              <span className="tree-root-icon">{rootIcon(root.kind)}</span>
              <span className="tree-label">{root.name}</span>
            </div>
            {errors[root.path] ? (
              <div className="tree-error" style={{ paddingLeft: 30 }}>
                <AlertCircle size={12} />
                <span>Kein Zugriff</span>
              </div>
            ) : null}
            {isExpanded && childEntries ? (
              <div className="tree-children">
                {childEntries.map((entry) => (
                  <TreeNode
                    key={entry.path}
                    entry={entry}
                    depth={1}
                    mode={mode}
                    selectedPath={selectedPath}
                    onSelect={onSelect}
                    expanded={expanded}
                    children={children}
                    loading={loading}
                    errors={errors}
                    onToggle={toggle}
                    dropTarget={dropTarget}
                    setDropTarget={setDropTarget}
                    onDropPaths={onDropPaths}
                  />
                ))}
                {childEntries.length === 0 ? (
                  <div className="tree-empty" style={{ paddingLeft: 34 }}>
                    Keine Unterordner
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

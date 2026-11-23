import { FolderPlus, HardDrive, Plus, Target } from 'lucide-react'
import { shortenPath } from '@shared/format'
import { useAppStore } from '../store/useAppStore'
import { FolderTree } from './FolderTree'
import type { TreeRoot } from './FolderTree'

function folderName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  if (parts.length === 0) return path || '/'
  const last = parts[parts.length - 1]
  if (/^[a-zA-Z]:$/.test(last)) return `${last}\\`
  return last
}

export function Sidebar(): React.JSX.Element {
  const roots = useAppStore((state) => state.roots)
  const sourcePath = useAppStore((state) => state.sourcePath)
  const navigate = useAppStore((state) => state.navigate)
  const settings = useAppStore((state) => state.settings)
  const targetPath = useAppStore((state) => state.targetPath)
  const setTarget = useAppStore((state) => state.setTarget)
  const addArchiveRoot = useAppStore((state) => state.addArchiveRoot)
  const chooseTarget = useAppStore((state) => state.chooseTarget)
  const addPathsToQueue = useAppStore((state) => state.addPathsToQueue)

  const archiveRoots = settings?.archiveRoots ?? []
  const targetRoots: TreeRoot[] = archiveRoots.map((path) => ({
    name: folderName(path),
    path,
    kind: 'archive',
    detail: path
  }))

  return (
    <aside className="sidebar">
      <section className="sidebar-section sources-section">
        <div className="sidebar-heading">
          <span>Quellen</span>
          <span className="sidebar-count">{roots.length}</span>
        </div>
        <div className="sidebar-scroll">
          <FolderTree
            roots={roots}
            mode="source"
            selectedPath={sourcePath}
            onSelect={(path) => void navigate(path)}
            emptyLabel="Keine Laufwerke gefunden"
          />
        </div>
      </section>

      <section className="sidebar-section targets-section">
        <div className="sidebar-heading">
          <span>Archivziele</span>
          <button
            type="button"
            className="icon-button small"
            onClick={() => void addArchiveRoot()}
            title="Archivordner hinzufügen"
            aria-label="Archivordner hinzufügen"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="sidebar-scroll">
          {targetRoots.length > 0 ? (
            <FolderTree
              roots={targetRoots}
              mode="target"
              selectedPath={targetPath}
              onSelect={setTarget}
              onDropPaths={(paths, targetDir) =>
                addPathsToQueue(paths, targetDir)
              }
              emptyLabel="Noch kein Archivziel"
            />
          ) : (
            <div className="sidebar-empty">
              <FolderPlus size={22} />
              <p>Noch kein Archivziel hinterlegt.</p>
              <button
                type="button"
                className="button small primary"
                onClick={() => void addArchiveRoot()}
              >
                <Plus size={14} />
                Ordner hinzufügen
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="sidebar-target">
        <div className="sidebar-target-label">
          <Target size={14} />
          <span>Aktuelles Ziel</span>
        </div>
        {targetPath ? (
          <>
            <div className="sidebar-target-path" title={targetPath}>
              <HardDrive size={14} />
              <span>{shortenPath(targetPath, 42)}</span>
            </div>
            <button
              type="button"
              className="button small ghost full"
              onClick={() => void chooseTarget()}
            >
              Ziel ändern
            </button>
          </>
        ) : (
          <button
            type="button"
            className="button small primary full"
            onClick={() => void chooseTarget()}
          >
            <Target size={14} />
            Ziel wählen
          </button>
        )}
      </div>
    </aside>
  )
}

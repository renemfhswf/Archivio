import { useEffect } from 'react'
import { AlertTriangle, Archive, Loader2, RotateCcw } from 'lucide-react'
import { useAppStore } from './store/useAppStore'
import { AppHeader } from './components/AppHeader'
import { CopyConflictModal } from './components/CopyConflictModal'
import { CopySummaryModal } from './components/CopySummaryModal'
import { DuplicatesView } from './components/DuplicatesView'
import { HistoryView } from './components/HistoryView'
import { SettingsView } from './components/SettingsView'
import { SortView } from './components/SortView'
import { Toasts } from './components/Toasts'

export default function App(): React.JSX.Element {
  const view = useAppStore((state) => state.view)
  const booted = useAppStore((state) => state.booted)
  const bootError = useAppStore((state) => state.bootError)
  const settings = useAppStore((state) => state.settings)
  const init = useAppStore((state) => state.init)
  const setView = useAppStore((state) => state.setView)
  const navigate = useAppStore((state) => state.navigate)
  const refresh = useAppStore((state) => state.refresh)
  const addArchiveRoot = useAppStore((state) => state.addArchiveRoot)
  const sourcePath = useAppStore((state) => state.sourcePath)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    const offCopy = window.archivio.onCopyProgress((progress) => {
      useAppStore.getState().handleCopyProgress(progress)
    })
    const offScan = window.archivio.onDuplicateProgress((progress) => {
      useAppStore.getState().handleScanProgress(progress)
    })
    return () => {
      offCopy()
      offScan()
    }
  }, [])

  useEffect(() => {
    const theme = settings?.theme ?? 'dark'
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const dark =
        theme === 'dark' || (theme === 'system' && media.matches)
      root.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    if (theme === 'system') {
      media.addEventListener('change', apply)
      return () => media.removeEventListener('change', apply)
    }
    return undefined
  }, [settings?.theme])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const inField =
        target !== null &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
          target.isContentEditable)

      if (event.ctrlKey && event.key.toLocaleLowerCase('de-DE') === 'o') {
        event.preventDefault()
        if (event.shiftKey) {
          void addArchiveRoot()
        } else {
          void window.archivio
            .chooseDirectory({
              title: 'Quellordner öffnen',
              defaultPath: sourcePath
            })
            .then((path) => {
              if (path) void navigate(path)
            })
        }
        return
      }
      if (event.ctrlKey && event.key === ',') {
        event.preventDefault()
        setView('settings')
        return
      }
      if (event.key === 'F5' && !inField) {
        event.preventDefault()
        void refresh()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [addArchiveRoot, navigate, refresh, setView, sourcePath])

  if (!booted) {
    return (
      <div className="boot-screen">
        <div className="boot-logo">
          <Archive size={34} />
        </div>
        <h1>Archivio</h1>
        <p>Dateien sortieren. Sicher ablegen.</p>
        <Loader2 size={20} className="spin" />
      </div>
    )
  }

  if (bootError) {
    return (
      <div className="boot-screen error">
        <div className="boot-logo error">
          <AlertTriangle size={32} />
        </div>
        <h1>Archivio konnte nicht gestartet werden</h1>
        <p>{bootError}</p>
        <button
          type="button"
          className="button primary"
          onClick={() => window.location.reload()}
        >
          <RotateCcw size={15} />
          Neu starten
        </button>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <AppHeader />
      <main className="app-main">
        {view === 'sort' ? <SortView /> : null}
        {view === 'duplicates' ? <DuplicatesView /> : null}
        {view === 'history' ? <HistoryView /> : null}
        {view === 'settings' ? <SettingsView /> : null}
      </main>
      <CopyConflictModal />
      <CopySummaryModal />
      <Toasts />
    </div>
  )
}

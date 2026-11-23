import { FileBrowser } from './FileBrowser'
import { PreviewPane } from './PreviewPane'
import { QueuePanel } from './QueuePanel'
import { Sidebar } from './Sidebar'

export function SortView(): React.JSX.Element {
  return (
    <div className="sort-view">
      <Sidebar />
      <FileBrowser />
      <aside className="right-rail">
        <PreviewPane />
        <QueuePanel />
      </aside>
    </div>
  )
}

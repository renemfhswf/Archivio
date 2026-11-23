import type { ErrorInfo, ReactNode } from 'react'
import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Archivio UI-Fehler', error, info)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="fatal-screen">
        <div className="fatal-card">
          <div className="fatal-icon">
            <AlertTriangle size={28} />
          </div>
          <h1>Die Oberfläche ist auf einen Fehler gestoßen.</h1>
          <p>
            Die Dateien auf deinen Laufwerken wurden nicht verändert. Bitte
            lade die Ansicht neu. Wenn der Fehler bleibt, findest du Details
            in der Protokolldatei im Datenordner von Archivio.
          </p>
          <pre>{this.state.error.message}</pre>
          <button
            type="button"
            className="button primary"
            onClick={() => window.location.reload()}
          >
            <RotateCcw size={16} />
            Neu laden
          </button>
        </div>
      </div>
    )
  }
}

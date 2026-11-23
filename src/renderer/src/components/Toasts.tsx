import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export function Toasts(): React.JSX.Element {
  const toasts = useAppStore((state) => state.toasts)
  const dismissToast = useAppStore((state) => state.dismissToast)

  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => {
        const Icon =
          toast.kind === 'success'
            ? CheckCircle2
            : toast.kind === 'error'
              ? AlertCircle
              : Info
        return (
          <div key={toast.id} className={`toast toast-${toast.kind}`}>
            <Icon size={18} />
            <span>{toast.message}</span>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismissToast(toast.id)}
              aria-label="Meldung schließen"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

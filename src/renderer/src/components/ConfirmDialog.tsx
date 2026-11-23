import type { ReactNode } from 'react'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Abbrechen',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
  children
}: ConfirmDialogProps): React.JSX.Element {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      dismissible={!busy}
      width={520}
      footer={
        <>
          <button
            type="button"
            className="button ghost"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`button ${danger ? 'danger' : 'primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Bitte warten …' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-message">{message}</div>
      {children}
    </Modal>
  )
}

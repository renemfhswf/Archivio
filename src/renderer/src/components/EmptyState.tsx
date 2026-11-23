import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: string
  children?: ReactNode
  compact?: boolean
}

export function EmptyState({
  icon,
  title,
  description,
  children,
  compact = false
}: EmptyStateProps): React.JSX.Element {
  return (
    <div className={`empty-state ${compact ? 'compact' : ''}`}>
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {children ? <div className="empty-actions">{children}</div> : null}
    </div>
  )
}

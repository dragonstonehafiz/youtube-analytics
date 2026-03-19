import type { ReactNode } from 'react'
import { ActionButton } from '@components/ui'

type Props = {
  title: string
  apiBadge: string
  isSyncActive: boolean
  isStopPending: boolean
  onStopSync: () => void
  onStartSync: () => void
  onRefresh: () => void
  children?: ReactNode
}

function SyncTabHeader({
  title,
  apiBadge,
  isSyncActive,
  isStopPending,
  onStopSync,
  onStartSync,
  onRefresh,
  children,
}: Props) {
  return (
    <div className="sync-card-header-row">
      <div className="sync-card-header">{title}</div>
      <span className="sync-api-badge">{apiBadge}</span>
      <ActionButton label="Refresh" onClick={onRefresh} variant="soft" />
      {children}
      <ActionButton
        label={isSyncActive ? (isStopPending ? 'Stopping...' : 'Stop sync') : 'Start sync'}
        onClick={isSyncActive ? onStopSync : onStartSync}
        disabled={isStopPending}
        variant={isSyncActive ? 'danger' : 'primary'}
      />
    </div>
  )
}

export default SyncTabHeader

import { useEffect, useMemo, useState } from 'react'
import { ActionButton } from '../../components/ui'
import { RatioBar } from '../../components/charts'
import { formatWholeNumber } from '../../utils/number'
import { getStored, setStored } from '../../utils/storage'
import type { ProgressState } from './SyncSettings'
import { buildApiCallRow } from './utils'

const DATA_STAGES = ['videos', 'playlists', 'comments', 'audience']

const DATA_PULL_OPTIONS = [
  { label: 'Videos', value: 'videos' },
  { label: 'Playlists', value: 'playlists' },
  { label: 'Comments', value: 'comments' },
  { label: 'Audience', value: 'audience' },
]

const PULL_COLORS: Record<string, string> = {
  videos: '#0ea5e9',
  comments: '#f97316',
  audience: '#22c55e',
  playlists: '#8b5cf6',
}

type Props = {
  isSyncActive: boolean
  isStopPending: boolean
  onStopSync: () => void
  onSetIsSyncing: (v: boolean) => void
  onSetProgress: (p: ProgressState) => void
  tableRowCounts: Record<string, number>
  resettingTableName: string | null
  onResetTable: (name: string) => void
  onRefresh: () => void
}

function DataSyncTab({
  isSyncActive,
  isStopPending,
  onStopSync,
  onSetIsSyncing,
  onSetProgress,
  tableRowCounts,
  resettingTableName,
  onResetTable,
  onRefresh,
}: Props) {
  type PullConfig = { included: boolean }

  const storedData = getStored(
    'syncSettingsData',
    null as { pullConfigs?: Record<string, { included?: boolean }> } | null,
  )

  const [dataPullConfigs, setDataPullConfigs] = useState<Record<string, PullConfig>>(() => {
    const stored = storedData?.pullConfigs ?? {}
    return Object.fromEntries(
      DATA_STAGES.map((s) => [s, { included: stored[s]?.included ?? true }]),
    )
  })
  const [apiCallsLoading, setApiCallsLoading] = useState(false)
  const [apiCallsError, setApiCallsError] = useState<string | null>(null)
  const [apiCallsByPull, setApiCallsByPull] = useState<Record<string, number>>({})

  useEffect(() => {
    setStored('syncSettingsData', { pullConfigs: dataPullConfigs })
  }, [dataPullConfigs])

  useEffect(() => {
    let active = true
    async function load() {
      const pulls = DATA_STAGES.filter((s) => dataPullConfigs[s]?.included !== false)
      if (pulls.length === 0) {
        setApiCallsByPull({})
        setApiCallsLoading(false)
        return
      }
      setApiCallsLoading(true)
      setApiCallsError(null)
      try {
        const params = new URLSearchParams({ pull: pulls.join(',') })
        const response = await fetch(`http://localhost:8000/sync/data/estimate?${params}`)
        if (!response.ok) throw new Error(`Request failed (${response.status})`)
        const data = await response.json()
        if (active) {
          setApiCallsByPull(
            typeof data.by_pull === 'object' && data.by_pull
              ? (data.by_pull as Record<string, number>)
              : {},
          )
        }
      } catch (error) {
        if (active) {
          setApiCallsError(error instanceof Error ? error.message : 'Failed to load estimate')
          setApiCallsByPull({})
        }
      } finally {
        if (active) setApiCallsLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [dataPullConfigs])

  const apiCallRow = useMemo(() => {
    const includedPulls = DATA_STAGES.filter((s) => dataPullConfigs[s]?.included !== false)
    return buildApiCallRow(includedPulls, DATA_PULL_OPTIONS, apiCallsByPull, 10000, PULL_COLORS)
  }, [dataPullConfigs, apiCallsByPull])

  const toggleDataConfig = (stage: string, key: 'included') => {
    setDataPullConfigs((prev) => ({
      ...prev,
      [stage]: { ...prev[stage], [key]: !prev[stage][key] },
    }))
  }

  const handleSync = async () => {
    const items = DATA_STAGES.filter((s) => dataPullConfigs[s]?.included !== false).map((s) => ({
      stage: s,
    }))
    if (items.length === 0) return
    onSetIsSyncing(true)
    onSetProgress({
      is_syncing: true,
      current_step: 0,
      max_steps: 0,
      message: 'Starting data sync…',
      stop_requested: false,
    })
    try {
      await fetch('http://localhost:8000/sync/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
    } catch (error) {
      console.error('Failed to start data sync', error)
    } finally {
      onSetIsSyncing(false)
    }
  }

  return (
    <div className="sync-card">
      <div className="sync-card-header-row">
        <div className="sync-card-header">Data Sync</div>
        <span className="sync-api-badge">YouTube Data API v3</span>
        <ActionButton label="Refresh" onClick={onRefresh} variant="soft" />
        <ActionButton
          label={isSyncActive ? (isStopPending ? 'Stopping...' : 'Stop sync') : 'Start sync'}
          onClick={isSyncActive ? onStopSync : handleSync}
          disabled={isStopPending}
          variant={isSyncActive ? 'danger' : 'primary'}
        />
      </div>
      <table className="sync-table">
        <thead>
          <tr>
            <th style={{ width: 120 }}>Table Name</th>
            <th style={{ width: 120 }}>Row Count</th>
            <th style={{ width: 60 }}>Include</th>
            <th style={{ width: 60 }}></th>
          </tr>
        </thead>
        <tbody>
          {DATA_PULL_OPTIONS.map((opt) => {
            const cfg = dataPullConfigs[opt.value]
            return (
              <tr key={opt.value}>
                <td className="sync-stage-label">{opt.label}</td>
                <td className="sync-row-count">{formatWholeNumber(tableRowCounts[opt.value] || 0)} rows</td>
                <td>
                  <input
                    type="checkbox"
                    checked={cfg.included}
                    onChange={() => toggleDataConfig(opt.value, 'included')}
                  />
                </td>
                <td>
                  <ActionButton
                    label={resettingTableName === opt.value ? 'Deleting...' : 'Delete'}
                    onClick={() => onResetTable(opt.value)}
                    disabled={resettingTableName === opt.value}
                    variant="danger"
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="sync-estimate-section">
        {apiCallsLoading ? (
          <div className="sync-estimate-meta">Loading...</div>
        ) : apiCallsError ? (
          <div className="sync-estimate-meta">{apiCallsError}</div>
        ) : (
          <div className="sync-estimate-bar-row">
            <div className="sync-estimate-bar-header">
              <span className="sync-estimate-api-label">Estimate YouTube Data API v3 API Calls</span>
              <span>{`${apiCallRow.total.toLocaleString()} / ${apiCallRow.max.toLocaleString()}`}</span>
            </div>
            <RatioBar length="100%" ratio={100} color="#94a3b8" segments={apiCallRow.segments} />
            <div className="sync-estimate-legend">
              {apiCallRow.legendItems.map((item) => (
                <div key={item.key} className="sync-estimate-legend-item">
                  <span className="sync-estimate-legend-dot" style={{ backgroundColor: item.color }} />
                  <span className="sync-estimate-legend-label">{item.label}</span>
                  <span className="sync-estimate-legend-value">{item.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default DataSyncTab

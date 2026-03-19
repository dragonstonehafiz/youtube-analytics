import { useCallback, useEffect, useRef, useState } from 'react'
import { ActionButton, PageSizePicker, PageSwitcher } from '@components/ui'
import usePagination from '@hooks/usePagination'
import { ProgressBar } from '@components/charts'
import { DonutChartCard } from '@components/cards'
import { PageCard } from '@components/ui'
import { formatDisplayDate } from '@utils/date'
import { getStored, setStored } from '@utils/storage'
import DataSyncTab from './DataSyncTab'
import AnalyticsSyncTab from './AnalyticsSyncTab'
import ChannelsSyncTab from './ChannelsSyncTab'
import '../shared.css'
import './SyncSettings.css'

export type ProgressState = {
  is_syncing: boolean
  current_step: number
  max_steps: number
  message: string
  stop_requested?: boolean
}

type CompetitorConfig = { label: string; channel_id: string; enabled: boolean; row_count?: number }

type SyncRun = {
  id: number
  started_at: string
  finished_at: string | null
  status: string
  error: string | null
  start_date: string | null
  end_date: string | null
  table_name: string
  deep_sync: number
  total_api_calls: number
}

type SyncTab = 'data' | 'analytics' | 'channels'

// Dependency map: parent table -> tables that depend on it
const TABLE_DEPENDENCIES: Record<string, string[]> = {
  videos: ['video_analytics', 'video_traffic_source', 'video_search_insights', 'comments'],
  playlists: ['playlist_items', 'playlist_daily_analytics'],
}

function SyncSettings() {
  const initialSyncTab = getStored('syncSettingsTab', 'data') as string
  const [syncTab, setSyncTab] = useState<SyncTab>(
    (['data', 'analytics', 'channels'] as string[]).includes(initialSyncTab)
      ? (initialSyncTab as SyncTab)
      : 'data',
  )

  // Shared sync/progress state
  const [isSyncing, setIsSyncing] = useState(false)
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const [stopRequestedByUser, setStopRequestedByUser] = useState(false)

  // Runs state
  const [runs, setRuns] = useState<SyncRun[]>([])
  const [runsTotal, setRunsTotal] = useState(0)
  const {
    page: runsPage,
    setPage: setRunsPage,
    pageSize: runsPageSize,
    setPageSize: setRunsPageSize,
    totalPages: runsTotalPages,
  } = usePagination({ total: runsTotal, defaultPageSize: 10 })
  const [selectedRunError, setSelectedRunError] = useState<{ runId: number; text: string } | null>(null)
  const [resettingTableName, setResettingTableName] = useState<string | null>(null)

  // Table data (row counts + storage)
  const [tableRowCounts, setTableRowCounts] = useState<Record<string, number>>({})
  const [tableStorage, setTableStorage] = useState<Array<{ table: string; bytes: number; percent: number }>>([])
  const [totalStorageBytes, setTotalStorageBytes] = useState(0)

  // Channels config
  const [channelsConfig, setChannelsConfig] = useState<Record<string, CompetitorConfig>>({})

  // Derived sync state
  const progressState: ProgressState | null =
    progress ??
    (isSyncing
      ? { is_syncing: true, current_step: 0, max_steps: 0, message: 'Starting sync…', stop_requested: false }
      : null)
  const isSyncActive = Boolean(progressState?.is_syncing) || isSyncing
  const isStopPending = Boolean(stopRequestedByUser || progressState?.stop_requested)

  useEffect(() => {
    setStored('syncSettingsTab', syncTab)
  }, [syncTab])

  useEffect(() => {
    if (!isSyncActive) {
      setStopRequestedByUser(false)
    }
  }, [isSyncActive])

  const loadRuns = useCallback(async () => {
    try {
      const offset = (runsPage - 1) * runsPageSize
      const response = await fetch(
        `http://localhost:8000/sync/runs?limit=${runsPageSize}&offset=${offset}`,
      )
      const data = await response.json()
      setRuns(Array.isArray(data.items) ? data.items : [])
      setRunsTotal(typeof data.total === 'number' ? data.total : 0)
    } catch (error) {
      console.error('Failed to load sync runs', error)
    }
  }, [runsPage, runsPageSize])

  const refreshTableData = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:8000/stats/overview')
      if (!res.ok) return
      const data = await res.json()
      const rowCountsList = data.table_row_counts || []
      const rowCountsMap: Record<string, number> = {}
      rowCountsList.forEach((item: { table: string; rows: number }) => {
        rowCountsMap[item.table] = item.rows
      })
      setTableRowCounts(rowCountsMap)
      const storageList = data.table_storage || []
      const total = storageList.reduce((sum: number, item: { bytes: number }) => sum + (item.bytes || 0), 0)
      setTableStorage(storageList)
      setTotalStorageBytes(total)
    } catch (error) {
      console.error('Failed to refresh table data:', error)
    }
  }, [])

  const loadChannels = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8000/channels')
      const data = await response.json()
      setChannelsConfig(data || {})
    } catch (error) {
      console.error('Failed to load channels', error)
    }
  }, [])

  useEffect(() => {
    loadRuns()
  }, [loadRuns])

  useEffect(() => {
    refreshTableData()
  }, [refreshTableData])

  useEffect(() => {
    loadChannels()
  }, [loadChannels])

  const pollActiveRef = useRef(false)
  useEffect(() => {
    pollActiveRef.current = true
    let timer: number | null = null
    async function poll() {
      if (!pollActiveRef.current) return
      try {
        const response = await fetch('http://localhost:8000/sync/progress')
        const data = await response.json()
        if (pollActiveRef.current && data?.is_syncing !== undefined) {
          setProgress(data as ProgressState)
        }
      } catch (error) {
        if (pollActiveRef.current) console.error('Failed to load sync progress', error)
      } finally {
        if (pollActiveRef.current) {
          timer = window.setTimeout(poll, 500)
        }
      }
    }
    poll()
    return () => {
      pollActiveRef.current = false
      if (timer) window.clearTimeout(timer)
    }
  }, [])

  const handleStopSync = async () => {
    try {
      const response = await fetch('http://localhost:8000/sync/stop', { method: 'POST' })
      const data = await response.json()
      if (data?.accepted) {
        setStopRequestedByUser(true)
      }
    } catch (error) {
      console.error('Failed to request sync stop', error)
    }
  }

  const handleStartSyncRequest = useCallback(async (message: string, request: () => Promise<void>) => {
    setIsSyncing(true)
    setProgress({
      is_syncing: true,
      current_step: 0,
      max_steps: 0,
      message,
      stop_requested: false,
    })
    try {
      await request()
    } catch (error) {
      console.error('Failed to start sync', error)
    } finally {
      setIsSyncing(false)
    }
  }, [])

  const handleResetTable = async (tableName: string) => {
    const dependents = TABLE_DEPENDENCIES[tableName] || []

    let confirmMessage = `Are you sure you want to reset the "${tableName}" table? This will delete all data.`
    if (dependents.length > 0) {
      confirmMessage += `\n\nThe following tables will also be cleared:\n${dependents.map((t) => `• ${t}`).join('\n')}`
    }

    if (!confirm(confirmMessage)) {
      return
    }

    setResettingTableName(tableName)
    try {
      const response = await fetch('http://localhost:8000/sync/reset-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_name: tableName }),
      })
      if (!response.ok) throw new Error(`Reset failed: ${response.status}`)
      await loadRuns()
      await refreshTableData()
    } catch (error) {
      console.error('Failed to reset table', error)
      alert(`Failed to reset table: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setResettingTableName(null)
    }
  }

  const computeProgress = () => {
    if (!progressState?.max_steps) return 0
    return Math.max(
      0,
      Math.min(100, (Math.max(0, progressState.current_step) / progressState.max_steps) * 100),
    )
  }

  const formatDuration = (started: string, finished: string | null) => {
    if (!finished) return '—'
    const totalSeconds = Math.max(
      0,
      Math.floor((new Date(finished).getTime() - new Date(started).getTime()) / 1000),
    )
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    if (hours > 0) return `${hours}hr ${minutes}min`
    return `${minutes}min ${seconds}s`
  }

  const formatRange = (run: { start_date: string | null; end_date: string | null }) => {
    if (run.start_date && run.end_date)
      return `${formatDisplayDate(run.start_date)} → ${formatDisplayDate(run.end_date)}`
    if (run.start_date) return `${formatDisplayDate(run.start_date)} → ?`
    if (run.end_date) return `? → ${formatDisplayDate(run.end_date)}`
    return '—'
  }

  const sharedTabProps = {
    isSyncActive,
    isStopPending,
    onStopSync: handleStopSync,
    onStartSyncRequest: handleStartSyncRequest,
  }

  return (
    <section className="page">
      <header className="page-header">
        <div className="header-text">
          <h1>Sync</h1>
        </div>
      </header>

      {tableStorage.length > 0 && (
        <PageCard title="Storage Usage">
          <DonutChartCard
            segments={tableStorage.map((item, index) => {
              const colors = ['#0ea5e9', '#14b8a6', '#f59e0b', '#f97316', '#84cc16', '#22c55e', '#6366f1', '#e11d48']
              return {
                key: item.table,
                label: item.table.replace(/_/g, ' '),
                value: item.bytes,
                color: colors[index % colors.length],
                displayValue: `${(item.bytes / 1024 / 1024).toFixed(2)} MB`,
              }
            })}
            centerLabel="Total Storage"
            centerValue={`${(totalStorageBytes / 1024 / 1024).toFixed(1)} MB`}
            ariaLabel="Storage usage by table"
          />
        </PageCard>
      )}

      <div className="sync-tab-row">
        <button
          type="button"
          className={syncTab === 'data' ? 'sync-tab active' : 'sync-tab'}
          onClick={() => setSyncTab('data')}
        >
          Data
        </button>
        <button
          type="button"
          className={syncTab === 'analytics' ? 'sync-tab active' : 'sync-tab'}
          onClick={() => setSyncTab('analytics')}
        >
          Analytics
        </button>
        <button
          type="button"
          className={syncTab === 'channels' ? 'sync-tab active' : 'sync-tab'}
          onClick={() => setSyncTab('channels')}
        >
          Channels
        </button>
      </div>

      <div className="page-body">
        <div className="page-row">
          {syncTab === 'data' && (
            <DataSyncTab
              {...sharedTabProps}
              tableRowCounts={tableRowCounts}
              resettingTableName={resettingTableName}
              onResetTable={handleResetTable}
              onRefresh={refreshTableData}
            />
          )}
          {syncTab === 'analytics' && (
            <AnalyticsSyncTab
              {...sharedTabProps}
              tableRowCounts={tableRowCounts}
              resettingTableName={resettingTableName}
              onResetTable={handleResetTable}
              onRefresh={refreshTableData}
            />
          )}
          {syncTab === 'channels' && (
            <ChannelsSyncTab {...sharedTabProps} initialConfig={channelsConfig} />
          )}
        </div>

        {/* Sync Runs Card */}
        <div className="page-row">
          <div className="sync-card">
            <div className="sync-card-header-row">
              <div className="sync-card-header">Sync Runs</div>
              <ActionButton
                label="Refresh"
                onClick={loadRuns}
                variant="soft"
                className="sync-refresh-button"
              />
            </div>
            {progressState?.is_syncing ? (
              <div className="sync-progress">
                <div className="sync-progress-bars">
                  <ProgressBar
                    label="Sync progress"
                    progress={computeProgress()}
                    stepText={`[${progressState.current_step ?? 0}/${progressState.max_steps ?? 0}]`}
                  />
                </div>
                <div className="sync-status-text">{progressState.message}</div>
              </div>
            ) : null}
            <div className="sync-table-container">
              <div className="sync-table-header">
                <span>Date</span>
                <span>Date Range</span>
                <span>Table</span>
                <span>Deep Sync</span>
                <span className="right">API Calls</span>
                <span className="right">Duration</span>
                <span className="right">Status</span>
                <span>Error</span>
              </div>
              {runs.length === 0 ? (
                <div className="sync-empty">No sync runs yet.</div>
              ) : (
                <>
                  {runs.map((run) => (
                    <div key={run.id} className="sync-table-row">
                      <span>{formatDisplayDate(run.started_at)}</span>
                      <span>{formatRange(run)}</span>
                      <span>{run.table_name}</span>
                      <span>{run.deep_sync ? 'Yes' : 'No'}</span>
                      <span className="right">{run.total_api_calls.toLocaleString()}</span>
                      <span className="right">{formatDuration(run.started_at, run.finished_at)}</span>
                      <span className="right">
                        <span className="sync-run-status">
                          {run.status === 'manual_stop' ? (
                            <span className="sync-run-status-stop" aria-hidden="true" />
                          ) : (
                            <span
                              className={[
                                'sync-run-status-dot',
                                run.status === 'success'
                                  ? 'success'
                                  : run.status === 'failed'
                                    ? 'failed'
                                    : 'neutral',
                              ].join(' ')}
                            />
                          )}
                          <span>{run.status}</span>
                        </span>
                      </span>
                      <span>
                        {run.error ? (
                          <ActionButton
                            label="View"
                            onClick={() => setSelectedRunError({ runId: run.id, text: run.error as string })}
                            variant="soft"
                          />
                        ) : (
                          '—'
                        )}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
            {runs.length > 0 ? (
              <div className="pagination-footer">
                <div className="pagination-main">
                  <PageSwitcher
                    currentPage={runsPage}
                    totalPages={runsTotalPages}
                    onPageChange={setRunsPage}
                  />
                </div>
                <div className="pagination-size">
                  <PageSizePicker value={runsPageSize} onChange={setRunsPageSize} />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {selectedRunError ? (
        <div className="sync-error-modal-overlay" onClick={() => setSelectedRunError(null)}>
          <div className="sync-error-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sync-error-modal-header">
              <div className="sync-card-header">Sync Error</div>
              <ActionButton
                label="Close"
                onClick={() => setSelectedRunError(null)}
                variant="soft"
                className="sync-refresh-button"
              />
            </div>
            <textarea
              className="sync-error-modal-textbox"
              value={selectedRunError.text}
              readOnly
            />
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default SyncSettings

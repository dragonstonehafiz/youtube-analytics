import { useEffect, useMemo, useState } from 'react'
import {
  ActionButton,
  DateRangePicker,
  Dropdown,
  MultiSelect,
  ProgressBar,
  YearInput,
} from '../components/ui'
import { getStored, setStored } from '../utils/storage'
import './Page.css'

function SyncSettings() {
  const [isSyncing, setIsSyncing] = useState(false)
  const storedSync = getStored('syncSettings', null as {
    rangeMode?: string
    startDate?: string
    endDate?: string
    year?: string
    deepSync?: boolean
    selectedPulls?: string[]
  } | null)
  const [runs, setRuns] = useState<
    {
      id: number
      started_at: string
      finished_at: string | null
      status: string
      start_date: string | null
      end_date: string | null
      deep_sync: number | null
      pulls: string | null
    }[]
  >([])
  const [runsPage, setRunsPage] = useState(1)
  const [runsTotal, setRunsTotal] = useState(0)
  const runsPageSize = 10
  const [overview, setOverview] = useState({
    db_size_bytes: 0,
    total_uploads: 0,
    total_views: 0,
    total_comments: 0,
    earliest_date: null as string | null,
    latest_date: null as string | null,
    daily_analytics_rows: 0,
    channel_daily_rows: 0,
    traffic_sources_rows: 0,
  })
  const [deepSync, setDeepSync] = useState(storedSync?.deepSync ?? false)
  const [progress, setProgress] = useState<{ is_syncing: boolean; current_step: number; max_steps: number; message: string } | null>(null)
  const today = new Date().toISOString().slice(0, 10)
  const [startDate, setStartDate] = useState(storedSync?.startDate ?? today)
  const [endDate, setEndDate] = useState(storedSync?.endDate ?? today)
  const [rangeMode, setRangeMode] = useState(storedSync?.rangeMode ?? 'full')
  const [year, setYear] = useState(storedSync?.year ?? '')
  const pullOptions = [
    { label: 'Videos', value: 'videos' },
    { label: 'Comments', value: 'comments' },
    { label: 'Traffic sources', value: 'traffic' },
    { label: 'Channel daily', value: 'channel_daily' },
    { label: 'Daily analytics', value: 'daily_analytics' },
  ]
  const [selectedPulls, setSelectedPulls] = useState(
    storedSync?.selectedPulls?.length ? storedSync.selectedPulls : pullOptions.map((item) => item.value)
  )

  const loadRuns = async () => {
    try {
      const offset = (runsPage - 1) * runsPageSize
      const response = await fetch(
        `http://127.0.0.1:8000/sync/runs?limit=${runsPageSize}&offset=${offset}`
      )
      const data = await response.json()
      setRuns(Array.isArray(data.items) ? data.items : [])
      setRunsTotal(typeof data.total === 'number' ? data.total : 0)
    } catch (error) {
      console.error('Failed to load sync runs', error)
    }
  }

  useEffect(() => {
    loadRuns()
  }, [runsPage])

  useEffect(() => {
    setStored('syncSettings', {
      rangeMode,
      startDate,
      endDate,
      year,
      deepSync,
      selectedPulls,
    })
  }, [rangeMode, startDate, endDate, year, deepSync, selectedPulls])

  useEffect(() => {
    async function loadOverview() {
      try {
        const response = await fetch('http://127.0.0.1:8000/stats/overview')
        const data = await response.json()
        setOverview({
          db_size_bytes: data.db_size_bytes ?? 0,
          total_uploads: data.total_uploads ?? 0,
          total_views: data.total_views ?? 0,
          total_comments: data.total_comments ?? 0,
          earliest_date: data.earliest_date ?? null,
          latest_date: data.latest_date ?? null,
          daily_analytics_rows: data.daily_analytics_rows ?? 0,
          channel_daily_rows: data.channel_daily_rows ?? 0,
          traffic_sources_rows: data.traffic_sources_rows ?? 0,
        })
      } catch (error) {
        console.error('Failed to load overview stats', error)
      }
    }

    loadOverview()
  }, [])

  const progressState =
    progress ??
    (isSyncing
      ? { is_syncing: true, current_step: 0, max_steps: 0, message: 'Starting sync…' }
      : null)

  const computeProgress = () => {
    if (!progressState?.max_steps || progressState.max_steps === 0) {
      return 0
    }
    const current = Math.max(0, progressState.current_step)
    const percent = (current / progressState.max_steps) * 100
    return Math.max(0, Math.min(100, percent))
  }

  const currentStatus = () => {
    if (!progressState?.is_syncing) {
      return ''
    }
    return progressState.message || ''
  }

  const runsTotalPages = useMemo(
    () => Math.max(1, Math.ceil(runsTotal / runsPageSize)),
    [runsTotal]
  )
  const runsPagination = useMemo(() => {
    if (runsTotalPages <= 3) {
      return Array.from({ length: runsTotalPages }, (_, idx) => idx + 1)
    }
    const start = Math.max(1, Math.min(runsPage - 1, runsTotalPages - 2))
    return [start, start + 1, start + 2]
  }, [runsPage, runsTotalPages])

  useEffect(() => {
    let timer: number | null = null
    async function pollProgress() {
      try {
        const response = await fetch('http://127.0.0.1:8000/sync/progress')
        const data = await response.json()
        if (data && data.is_syncing !== undefined) {
          setProgress(data)
        }
      } catch (error) {
        console.error('Failed to load sync progress', error)
      } finally {
        timer = window.setTimeout(pollProgress, 500)
      }
    }

    pollProgress()
    return () => {
      if (timer) {
        window.clearTimeout(timer)
      }
    }
  }, [])

  const handleSync = async () => {
    setIsSyncing(true)
    setProgress({ is_syncing: true, current_step: 0, max_steps: 0, message: 'Starting sync…' })
    try {
      const params = new URLSearchParams()
      if (rangeMode === 'year' && year) {
        params.set('start_date', `${year}-01-01`)
        params.set('end_date', `${year}-12-31`)
      }
      if (rangeMode === 'custom') {
        if (startDate) {
          params.set('start_date', startDate)
        }
        if (endDate) {
          params.set('end_date', endDate)
        }
      }
      if (deepSync) {
        params.set('deep_sync', 'true')
      }
      if (selectedPulls.length > 0 && selectedPulls.length < pullOptions.length) {
        params.set('pull', selectedPulls.join(','))
      }
      await fetch(`http://127.0.0.1:8000/sync?${params.toString()}`, { method: 'POST' })
    } catch (error) {
      console.error('Failed to start sync', error)
    } finally {
      setIsSyncing(false)
    }
  }

  const handlePrune = async () => {
    if (!confirm('Prune videos that no longer exist? This will remove related analytics.')) {
      return
    }
    setIsSyncing(true)
    setProgress({ is_syncing: true, current_step: 0, max_steps: 0, message: 'Starting prune…' })
    try {
      await fetch('http://127.0.0.1:8000/sync/prune', { method: 'POST' })
    } catch (error) {
      console.error('Failed to start prune', error)
    } finally {
      setIsSyncing(false)
    }
  }

  const formatDuration = (started: string, finished: string | null) => {
    if (!finished) {
      return '—'
    }
    const start = new Date(started).getTime()
    const end = new Date(finished).getTime()
    const totalSeconds = Math.max(0, Math.floor((end - start) / 1000))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    if (hours > 0) {
      return `${hours}hr ${minutes}min`
    }
    return `${minutes}min ${seconds}s`
  }


  const formatRange = (run: {
    start_date: string | null
    end_date: string | null
  }) => {
    if (run.start_date && run.end_date) {
      return `${run.start_date} → ${run.end_date}`
    }
    if (run.start_date) {
      return `${run.start_date} → ?`
    }
    if (run.end_date) {
      return `? → ${run.end_date}`
    }
    return 'Full data'
  }

  return (
    <section className="page">
      <header className="page-header header-row">
        <div className="header-text">
          <h1>Sync</h1>
        </div>
        <div className="sync-header-controls">
          <div className="sync-control-col">
            <ActionButton
              label="Prune"
              onClick={handlePrune}
              title="Remove videos that no longer exist and their analytics"
              disabled={isSyncing || progress?.is_syncing}
              variant="danger"
              className="sync-prune-button"
            />
          </div>
          <div className="sync-control-col">
            <Dropdown
              value={rangeMode}
              onChange={setRangeMode}
              placeholder="Full data"
              items={[
                { type: 'option' as const, label: 'Full data', value: 'full' },
                { type: 'option' as const, label: 'Year', value: 'year' },
                { type: 'option' as const, label: 'Custom range', value: 'custom' },
              ]}
            />
          </div>
          {rangeMode === 'year' ? (
            <div className="sync-control-col">
              <YearInput value={year} onChange={setYear} />
            </div>
          ) : null}
          {rangeMode === 'custom' ? (
            <div className="sync-control-col">
              <DateRangePicker
                startDate={startDate}
                endDate={endDate}
                onChange={(nextStart, nextEnd) => {
                  setStartDate(nextStart)
                  setEndDate(nextEnd)
                }}
              />
            </div>
          ) : null}
          <div className="sync-control-col">
            <MultiSelect
              items={pullOptions}
              selected={selectedPulls}
              onChange={setSelectedPulls}
              placeholder="All data"
            />
          </div>
          <div className="sync-control-col">
            <label className="sync-check">
              <input
                type="checkbox"
                checked={deepSync}
                onChange={(event) => setDeepSync(event.target.checked)}
              />
              <span>Deep sync</span>
              <span
                className="sync-help"
                title="Deep sync re-pulls all data in the selected range, even if it already exists."
              >
                ?
              </span>
            </label>
          </div>
          <div className="sync-control-col sync-control-action">
            <ActionButton
              label={isSyncing || progress?.is_syncing ? 'Syncing...' : 'Start sync'}
              onClick={handleSync}
              title={isSyncing || progress?.is_syncing ? 'Syncing...' : 'Start syncing'}
              disabled={isSyncing || progress?.is_syncing}
              variant="primary"
            />
          </div>
        </div>
      </header>
      <div className="page-body">
        <div className="page-row">
          <div className="sync-table">
            <div className="sync-card-header-row">
              <div className="sync-card-header">Database Overview</div>
            </div>
            <div className="sync-stats">
              <div>
                <div className="sync-stat-label">Database size</div>
                <div className="sync-stat-value">{(overview.db_size_bytes / (1024 * 1024)).toFixed(2)} MB</div>
              </div>
              <div>
                <div className="sync-stat-label">Earliest data</div>
                <div className="sync-stat-value">{overview.earliest_date ?? '—'}</div>
              </div>
              <div>
                <div className="sync-stat-label">Latest data</div>
                <div className="sync-stat-value">{overview.latest_date ?? '—'}</div>
              </div>
            </div>
            <div className="sync-stats sync-stats-row">
              <div>
                <div className="sync-stat-label">Total comments</div>
                <div className="sync-stat-value">{overview.total_comments.toLocaleString()}</div>
              </div>
              <div>
                <div className="sync-stat-label">Total uploads</div>
                <div className="sync-stat-value">{overview.total_uploads.toLocaleString()}</div>
              </div>
              <div>
                <div className="sync-stat-label">Total views</div>
                <div className="sync-stat-value">{overview.total_views.toLocaleString()}</div>
              </div>
            </div>
            <div className="sync-stats sync-stats-row">
              <div>
                <div className="sync-stat-label">Traffic sources rows</div>
                <div className="sync-stat-value">{overview.traffic_sources_rows.toLocaleString()}</div>
              </div>
              <div>
                <div className="sync-stat-label">Channel daily rows</div>
                <div className="sync-stat-value">{overview.channel_daily_rows.toLocaleString()}</div>
              </div>
              <div>
                <div className="sync-stat-label">Daily analytics rows</div>
                <div className="sync-stat-value">{overview.daily_analytics_rows.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="page-row">
          <div className="sync-table">
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
                    stepText={`[${progressState?.current_step ?? 0}/${progressState?.max_steps ?? 0}]`}
                  />
                </div>
                <div className="sync-status-text">{currentStatus()}</div>
              </div>
            ) : null}
            <div className="sync-table-header">
              <span>Start</span>
              <span>Complete</span>
              <span>Range</span>
              <span>Pulls</span>
              <span>Deep Sync</span>
              <span className="right">Duration</span>
              <span className="right">Status</span>
            </div>
            {runs.length === 0 ? (
              <div className="sync-empty">No sync runs yet.</div>
            ) : (
              <>
                {runs.map((run) => (
                  <div key={run.id} className="sync-table-row">
                    <span>{new Date(run.started_at).toLocaleString()}</span>
                    <span>{run.finished_at ? new Date(run.finished_at).toLocaleString() : '—'}</span>
                    <span>{formatRange(run)}</span>
                    <span>{run.pulls ? run.pulls : 'All'}</span>
                    <span>{run.deep_sync ? 'Yes' : 'No'}</span>
                    <span className="right">{formatDuration(run.started_at, run.finished_at)}</span>
                    <span className="right">{run.status}</span>
                  </div>
                ))}
              </>
            )}
            {runsTotalPages > 1 ? (
              <div className="video-pagination">
                <ActionButton
                  label="<<"
                  onClick={() => setRunsPage(1)}
                  disabled={runsPage <= 1}
                  variant="soft"
                  className="video-page"
                />
                <ActionButton
                  label="<"
                  onClick={() => setRunsPage((prev) => Math.max(1, prev - 1))}
                  disabled={runsPage <= 1}
                  variant="soft"
                  className="video-page"
                />
                {runsPagination.map((item) => (
                  <ActionButton
                    key={item}
                    label={String(item)}
                    onClick={() => setRunsPage(item)}
                    variant="soft"
                    active={item === runsPage}
                    className="video-page"
                  />
                ))}
                <ActionButton
                  label=">"
                  onClick={() => setRunsPage((prev) => Math.min(runsTotalPages, prev + 1))}
                  disabled={runsPage >= runsTotalPages}
                  variant="soft"
                  className="video-page"
                />
                <ActionButton
                  label=">>"
                  onClick={() => setRunsPage(runsTotalPages)}
                  disabled={runsPage >= runsTotalPages}
                  variant="soft"
                  className="video-page"
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}

export default SyncSettings

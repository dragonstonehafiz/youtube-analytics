import { useEffect, useMemo, useState } from 'react'
import {
  ActionButton,
  DateRangePicker,
  Dropdown,
  MultiSelect,
  PageSizePicker,
  PageSwitcher,
  ProgressBar,
  YearInput,
} from '../components/ui'
import { formatDisplayDate } from '../utils/date'
import { getSharedPageSize, getStored, setSharedPageSize, setStored } from '../utils/storage'
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
  const [runsPageSize, setRunsPageSize] = useState(() => getSharedPageSize(10))
  const [overview, setOverview] = useState({
    db_size_bytes: 0,
    total_uploads: 0,
    total_playlists: 0,
    total_views: 0,
    total_comments: 0,
    earliest_date: null as string | null,
    latest_date: null as string | null,
    daily_analytics_rows: 0,
    channel_daily_rows: 0,
    traffic_sources_rows: 0,
    playlist_analytics_rows: 0,
    table_storage: [] as { table: string; bytes: number; percent: number }[],
  })
  const [deepSync, setDeepSync] = useState(storedSync?.deepSync ?? false)
  const [progress, setProgress] = useState<{ is_syncing: boolean; current_step: number; max_steps: number; message: string } | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [hoveredStorageTable, setHoveredStorageTable] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)
  const [startDate, setStartDate] = useState(storedSync?.startDate ?? today)
  const [endDate, setEndDate] = useState(storedSync?.endDate ?? today)
  const [rangeMode, setRangeMode] = useState(storedSync?.rangeMode ?? 'full')
  const [year, setYear] = useState(storedSync?.year ?? '')
  const pullOptions = [
    { label: 'Videos', value: 'videos' },
    { label: 'Comments', value: 'comments' },
    { label: 'Playlists', value: 'playlists' },
    { label: 'Playlist Analytics', value: 'playlist_analytics' },
    { label: 'Traffic sources', value: 'traffic' },
    { label: 'Channel analytics', value: 'channel_analytics' },
    { label: 'Video analytics', value: 'video_analytics' },
  ]
  const [selectedPulls, setSelectedPulls] = useState(
    storedSync?.selectedPulls?.length ? storedSync.selectedPulls : pullOptions.map((item) => item.value)
  )
  const validPullValues = useMemo(() => new Set(pullOptions.map((item) => item.value)), [pullOptions])
  const invalidSelectedPulls = useMemo(
    () => selectedPulls.filter((value) => !validPullValues.has(value)),
    [selectedPulls, validPullValues]
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
  }, [runsPage, runsPageSize])

  useEffect(() => {
    setRunsPage(1)
  }, [runsPageSize])

  useEffect(() => {
    setSharedPageSize(runsPageSize)
  }, [runsPageSize])

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
          total_playlists: data.total_playlists ?? 0,
          total_views: data.total_views ?? 0,
          total_comments: data.total_comments ?? 0,
          earliest_date: data.earliest_date ?? null,
          latest_date: data.latest_date ?? null,
          daily_analytics_rows: data.daily_analytics_rows ?? 0,
          channel_daily_rows: data.channel_daily_rows ?? 0,
          traffic_sources_rows: data.traffic_sources_rows ?? 0,
          playlist_analytics_rows: data.playlist_analytics_rows ?? 0,
          table_storage: Array.isArray(data.table_storage)
            ? data.table_storage
              .map((item: { table?: string; bytes?: number; percent?: number }) => ({
                table: item.table ?? '',
                bytes: typeof item.bytes === 'number' ? item.bytes : 0,
                percent: typeof item.percent === 'number' ? item.percent : 0,
              }))
              .filter((item: { table: string }) => item.table.length > 0)
            : [],
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
  const formatBytes = (value: number) => {
    if (value >= 1024 * 1024) {
      return `${(value / (1024 * 1024)).toFixed(2)} MB`
    }
    if (value >= 1024) {
      return `${(value / 1024).toFixed(2)} KB`
    }
    return `${value} B`
  }
  const pieSegments = useMemo(() => {
    const colors = ['#0ea5e9', '#14b8a6', '#f59e0b', '#f97316', '#84cc16', '#22c55e', '#6366f1', '#e11d48']
    let runningPercent = 0
    return overview.table_storage
      .filter((item) => item.percent > 0)
      .map((item, index) => {
        const start = runningPercent
        const end = runningPercent + item.percent
        runningPercent = end
        return {
          ...item,
          start,
          end,
          color: colors[index % colors.length],
        }
      })
  }, [overview.table_storage])
  const hoveredSegment = useMemo(
    () => pieSegments.find((segment) => segment.table === hoveredStorageTable) ?? null,
    [pieSegments, hoveredStorageTable]
  )

  const runsTotalPages = useMemo(
    () => Math.max(1, Math.ceil(runsTotal / runsPageSize)),
    [runsTotal, runsPageSize]
  )

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
    if (invalidSelectedPulls.length > 0) {
      setSyncError(`Invalid pull keys in saved settings: ${invalidSelectedPulls.join(', ')}`)
      return
    }
    setSyncError(null)
    setIsSyncing(true)
    setProgress({ is_syncing: true, current_step: 0, max_steps: 0, message: 'Starting sync…' })
    try {
      const params = new URLSearchParams()
      if (rangeMode === 'year' && year) {
        params.set('start_date', `${year}-01-01`)
        params.set('end_date', `${year}-12-31`)
      }
      if (rangeMode === 'latest' && overview.latest_date) {
        params.set('start_date', overview.latest_date)
        params.set('end_date', today)
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
      return `${formatDisplayDate(run.start_date)} → ${formatDisplayDate(run.end_date)}`
    }
    if (run.start_date) {
      return `${formatDisplayDate(run.start_date)} → ?`
    }
    if (run.end_date) {
      return `? → ${formatDisplayDate(run.end_date)}`
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
                { type: 'option' as const, label: 'From Latest Date', value: 'latest' },
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
              onChange={(next) => {
                setSyncError(null)
                setSelectedPulls(next.filter((value) => validPullValues.has(value)))
              }}
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
              disabled={isSyncing || progress?.is_syncing || invalidSelectedPulls.length > 0}
              variant="primary"
            />
          </div>
        </div>
        {syncError ? <div className="sync-error-text">{syncError}</div> : null}
      </header>
      <div className="page-body">
        <div className="page-row">
          <div className="sync-table">
            <div className="sync-card-header-row">
              <div className="sync-card-header">Database Overview</div>
            </div>
            <div className="db-overview-grid">
              <div className="db-overview-size">
                <div className="db-overview-pie-wrap">
                  <div className="db-overview-pie-chart">
                    <svg className="db-overview-pie" viewBox="0 0 140 140" role="img" aria-label="Table storage distribution">
                      <circle cx="70" cy="70" r="52" fill="none" stroke="#e2e8f0" strokeWidth="18" />
                      {pieSegments.map((segment) => {
                        const circumference = 2 * Math.PI * 52
                        const segmentLength = (segment.percent / 100) * circumference
                        const segmentOffset = -((segment.start / 100) * circumference)
                        return (
                          <circle
                            key={segment.table}
                            cx="70"
                            cy="70"
                            r="52"
                            fill="none"
                            stroke={segment.color}
                            strokeWidth="18"
                            strokeLinecap="butt"
                            strokeDasharray={`${segmentLength} ${circumference}`}
                            strokeDashoffset={segmentOffset}
                            transform="rotate(-90 70 70)"
                            onMouseEnter={() => setHoveredStorageTable(segment.table)}
                            onMouseLeave={() => setHoveredStorageTable(null)}
                          />
                        )
                      })}
                    </svg>
                    <div className="db-overview-pie-center">
                      <div className="db-overview-pie-center-label">Total size</div>
                      <div className="db-overview-pie-center-value">{formatBytes(overview.db_size_bytes)}</div>
                    </div>
                  </div>
                </div>
                {pieSegments.length === 0 ? (
                  <div className="sync-storage-empty">No table storage data available.</div>
                ) : (
                  <div className="db-overview-hover">
                    {hoveredSegment ? (
                      <span>{`${hoveredSegment.table}: ${formatBytes(hoveredSegment.bytes)} (${hoveredSegment.percent.toFixed(2)}%)`}</span>
                    ) : (
                      <span>Hover a slice to see table size and percentage</span>
                    )}
                  </div>
                )}
              </div>
              <div className="db-overview-col">
                <div className="db-overview-metric">
                  <div className="sync-stat-label">Earliest data</div>
                  <div className="sync-stat-value">{formatDisplayDate(overview.earliest_date)}</div>
                </div>
                <div className="db-overview-metric">
                  <div className="sync-stat-label">Latest data</div>
                  <div className="sync-stat-value">{formatDisplayDate(overview.latest_date)}</div>
                </div>
              </div>
              <div className="db-overview-col">
                <div className="db-overview-metric">
                  <div className="sync-stat-label-row">
                    <div className="sync-stat-label">Total videos</div>
                    <span className="sync-help sync-metric-help" title={'API Used:\n- YouTube Data API v3'}>
                      i
                    </span>
                  </div>
                  <div className="sync-stat-value">{overview.total_uploads.toLocaleString()}</div>
                </div>
                <div className="db-overview-metric">
                  <div className="sync-stat-label-row">
                    <div className="sync-stat-label">Total playlists</div>
                    <span className="sync-help sync-metric-help" title={'API Used:\n- YouTube Data API v3'}>
                      i
                    </span>
                  </div>
                  <div className="sync-stat-value">{overview.total_playlists.toLocaleString()}</div>
                </div>
                <div className="db-overview-metric">
                  <div className="sync-stat-label-row">
                    <div className="sync-stat-label">Total comments</div>
                    <span className="sync-help sync-metric-help" title={'API Used:\n- YouTube Data API v3'}>
                      i
                    </span>
                  </div>
                  <div className="sync-stat-value">{overview.total_comments.toLocaleString()}</div>
                </div>
              </div>
              <div className="db-overview-rows">
                <div className="db-overview-row-metric">
                  <div className="sync-stat-label-row">
                    <div className="sync-stat-label">Channel analytics rows</div>
                    <span className="sync-help sync-metric-help" title={'API Used:\n- YouTube Analytics API v2'}>
                      i
                    </span>
                  </div>
                  <div className="sync-stat-value">{overview.channel_daily_rows.toLocaleString()}</div>
                </div>
                <div className="db-overview-row-metric">
                  <div className="sync-stat-label-row">
                    <div className="sync-stat-label">Video analytics rows</div>
                    <span className="sync-help sync-metric-help" title={'API Used:\n- YouTube Analytics API v2'}>
                      i
                    </span>
                  </div>
                  <div className="sync-stat-value">{overview.daily_analytics_rows.toLocaleString()}</div>
                </div>
                <div className="db-overview-row-metric">
                  <div className="sync-stat-label-row">
                    <div className="sync-stat-label">Playlist analytics rows</div>
                    <span className="sync-help sync-metric-help" title={'API Used:\n- YouTube Analytics API v2'}>
                      i
                    </span>
                  </div>
                  <div className="sync-stat-value">{overview.playlist_analytics_rows.toLocaleString()}</div>
                </div>
                <div className="db-overview-row-metric">
                  <div className="sync-stat-label-row">
                    <div className="sync-stat-label">Traffic source rows</div>
                    <span className="sync-help sync-metric-help" title={'API Used:\n- YouTube Analytics API v2'}>
                      i
                    </span>
                  </div>
                  <div className="sync-stat-value">{overview.traffic_sources_rows.toLocaleString()}</div>
                </div>
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
                    <span>{formatDisplayDate(run.started_at)}</span>
                    <span>{run.finished_at ? formatDisplayDate(run.finished_at) : '—'}</span>
                    <span>{formatRange(run)}</span>
                    <span>{run.pulls ? run.pulls : 'All'}</span>
                    <span>{run.deep_sync ? 'Yes' : 'No'}</span>
                    <span className="right">{formatDuration(run.started_at, run.finished_at)}</span>
                    <span className="right">{run.status}</span>
                  </div>
                ))}
              </>
            )}
            {runs.length > 0 ? (
              <div className="pagination-footer">
                <div className="pagination-main">
                  <PageSwitcher currentPage={runsPage} totalPages={runsTotalPages} onPageChange={setRunsPage} />
                </div>
                <div className="pagination-size">
                  <PageSizePicker value={runsPageSize} onChange={setRunsPageSize} />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}

export default SyncSettings

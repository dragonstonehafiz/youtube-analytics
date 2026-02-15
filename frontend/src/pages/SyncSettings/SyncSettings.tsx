import { useEffect, useMemo, useState } from 'react'
import {
  ActionButton,
  DateRangePicker,
  DonutChart,
  Dropdown,
  MultiSelect,
  PageSizePicker,
  PageSwitcher,
  ProgressBar,
  RatioBar,
  YearInput,
  type DonutSegmentResolved,
} from '../../components/ui'
import { formatDisplayDate } from '../../utils/date'
import { getSharedPageSize, getStored, setSharedPageSize, setStored } from '../../utils/storage'
import '../shared.css'
import './SyncSettings.css'

function SyncSettings() {
  const formatTableMetricLabel = (table: string): string => {
    const explicitLabels: Record<string, string> = {
      video_analytics: 'Video analytics rows',
      channel_analytics: 'Channel analytics rows',
      playlist_daily_analytics: 'Playlist analytics rows',
      traffic_sources_daily: 'Traffic source rows',
      video_traffic_source: 'Video traffic source rows',
      video_search_insights: 'Video search rows',
      playlist_items: 'Playlist items',
      playlists: 'Playlists',
      videos: 'Videos',
      comments: 'Comments',
      audience: 'Audience',
    }
    if (explicitLabels[table]) {
      return explicitLabels[table]
    }
    return table
      .split('_')
      .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
      .join(' ')
  }
  const getTableApiUsage = (table: string): string => {
    const usage: Record<string, string[]> = {
      videos: ['YouTube Data API v3'],
      comments: ['YouTube Data API v3'],
      audience: ['YouTube Data API v3'],
      playlists: ['YouTube Data API v3'],
      playlist_items: ['YouTube Data API v3'],
      video_analytics: ['YouTube Analytics API v2'],
      channel_analytics: ['YouTube Analytics API v2'],
      playlist_daily_analytics: ['YouTube Analytics API v2'],
      traffic_sources_daily: ['YouTube Analytics API v2'],
      video_traffic_source: ['YouTube Analytics API v2'],
      video_search_insights: ['YouTube Analytics API v2'],
    }
    const lines = usage[table] ?? ['Project database only']
    return `This uses:\n${lines.map((line) => `- ${line}`).join('\n')}`
  }

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
      error: string | null
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
    total_comments: 0,
    total_audience: 0,
    total_playlists: 0,
    total_views: 0,
    earliest_date: null as string | null,
    latest_date: null as string | null,
    video_analytics_rows: 0,
    channel_analytics_rows: 0,
    traffic_sources_rows: 0,
    video_traffic_source_rows: 0,
    video_search_rows: 0,
    playlist_analytics_rows: 0,
    table_storage: [] as { table: string; bytes: number; percent: number }[],
    table_row_counts: [] as { table: string; rows: number }[],
  })
  const [deepSync, setDeepSync] = useState(storedSync?.deepSync ?? false)
  const [progress, setProgress] = useState<{ is_syncing: boolean; current_step: number; max_steps: number; message: string; stop_requested?: boolean } | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncNotice, setSyncNotice] = useState<string | null>(null)
  const [stopRequestedByUser, setStopRequestedByUser] = useState(false)
  const [selectedRunError, setSelectedRunError] = useState<{ runId: number; text: string } | null>(null)
  const [hoveredStorageSegment, setHoveredStorageSegment] = useState<DonutSegmentResolved | null>(null)
  const [selectedOverviewTable, setSelectedOverviewTable] = useState('')
  const [showTableColumns, setShowTableColumns] = useState(false)
  const [tableDetailsLoading, setTableDetailsLoading] = useState(false)
  const [tableDetailsError, setTableDetailsError] = useState<string | null>(null)
  const [tableDetails, setTableDetails] = useState<{
    table: string
    date_column: string | null
    oldest_item_date: string | null
    newest_item_date: string | null
    columns: { name: string; declared_type: string; expected_value: string }[]
  } | null>(null)
  const [pullApiCallsLoading, setPullApiCallsLoading] = useState(false)
  const [pullApiCallsError, setPullApiCallsError] = useState<string | null>(null)
  const [pullApiCallsByPull, setPullApiCallsByPull] = useState<Record<string, number>>({})
  const today = new Date().toISOString().slice(0, 10)
  const [startDate, setStartDate] = useState(storedSync?.startDate ?? today)
  const [endDate, setEndDate] = useState(storedSync?.endDate ?? today)
  const [rangeMode, setRangeMode] = useState(storedSync?.rangeMode ?? 'full')
  const [year, setYear] = useState(storedSync?.year ?? '')
  const pullOptions = [
    { label: 'Videos', value: 'videos' },
    { label: 'Comments', value: 'comments' },
    { label: 'Audience', value: 'audience' },
    { label: 'Playlists', value: 'playlists' },
    { label: 'Playlist Analytics', value: 'playlist_analytics' },
    { label: 'Traffic sources', value: 'traffic' },
    { label: 'Channel analytics', value: 'channel_analytics' },
    { label: 'Video analytics', value: 'video_analytics' },
    { label: 'Video traffic source', value: 'video_traffic_source' },
    { label: 'Video search insights', value: 'video_search_insights' },
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

  const loadOverview = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/stats/overview')
      const data = await response.json()
      setOverview({
        db_size_bytes: data.db_size_bytes ?? 0,
        total_uploads: data.total_uploads ?? 0,
        total_comments: data.total_comments ?? 0,
        total_audience: data.total_audience ?? 0,
        total_playlists: data.total_playlists ?? 0,
        total_views: data.total_views ?? 0,
        earliest_date: data.earliest_date ?? null,
        latest_date: data.latest_date ?? null,
        video_analytics_rows: data.video_analytics_rows ?? 0,
        channel_analytics_rows: data.channel_analytics_rows ?? 0,
        traffic_sources_rows: data.traffic_sources_rows ?? 0,
        video_traffic_source_rows: data.video_traffic_source_rows ?? 0,
        video_search_rows: data.video_search_rows ?? 0,
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
        table_row_counts: Array.isArray(data.table_row_counts)
          ? data.table_row_counts
            .map((item: { table?: string; rows?: number }) => ({
              table: item.table ?? '',
              rows: typeof item.rows === 'number' ? item.rows : 0,
            }))
            .filter((item: { table: string }) => item.table.length > 0)
          : [],
      })
    } catch (error) {
      console.error('Failed to load overview stats', error)
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
    loadOverview()
  }, [])

  const progressState =
    progress ??
    (isSyncing
      ? { is_syncing: true, current_step: 0, max_steps: 0, message: 'Starting sync…', stop_requested: false }
      : null)
  const isSyncActive = Boolean(isSyncing || progressState?.is_syncing)
  const isStopPending = Boolean(stopRequestedByUser || progressState?.stop_requested)

  useEffect(() => {
    if (!isSyncActive) {
      setSyncNotice(null)
      setStopRequestedByUser(false)
    }
  }, [isSyncActive])

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
    return overview.table_storage
      .filter((item) => item.percent > 0)
      .map((item, index) => {
        return {
          key: item.table,
          label: item.table,
          value: item.bytes,
          bytes: item.bytes,
          percent: item.percent,
          color: colors[index % colors.length],
        }
      })
  }, [overview.table_storage])
  const orderedTableRowCounts = useMemo(() => {
    const order: Record<string, number> = {
      videos: 1,
      comments: 2,
      audience: 3,
      playlists: 4,
      playlist_items: 5,
      video_analytics: 6,
      channel_analytics: 7,
      playlist_daily_analytics: 8,
      traffic_sources_daily: 9,
      video_traffic_source: 10,
      video_search_insights: 11,
    }
    return [...overview.table_row_counts].sort((a, b) => {
      const aRank = order[a.table] ?? 999
      const bRank = order[b.table] ?? 999
      if (aRank !== bRank) {
        return aRank - bRank
      }
      return formatTableMetricLabel(a.table).localeCompare(formatTableMetricLabel(b.table))
    })
  }, [overview.table_row_counts])
  const overviewTableItems = useMemo(
    () =>
      orderedTableRowCounts.map((item) => ({
        type: 'option' as const,
        label: formatTableMetricLabel(item.table),
        value: item.table,
      })),
    [orderedTableRowCounts]
  )

  useEffect(() => {
    if (overviewTableItems.length === 0) {
      if (selectedOverviewTable) {
        setSelectedOverviewTable('')
      }
      return
    }
    const stillExists = overviewTableItems.some((item) => item.value === selectedOverviewTable)
    if (!selectedOverviewTable || !stillExists) {
      const videosOption = overviewTableItems.find((item) => item.value === 'videos')
      setSelectedOverviewTable(videosOption?.value ?? overviewTableItems[0].value)
    }
  }, [overviewTableItems, selectedOverviewTable])

  useEffect(() => {
    async function loadTableDetails() {
      if (!selectedOverviewTable) {
        setTableDetails(null)
        return
      }
      setTableDetailsLoading(true)
      setTableDetailsError(null)
      try {
        const response = await fetch(
          `http://127.0.0.1:8000/stats/table-details?table=${encodeURIComponent(selectedOverviewTable)}`
        )
        if (!response.ok) {
          throw new Error(`Failed to load table details (${response.status})`)
        }
        const data = await response.json()
        setTableDetails({
          table: data.table ?? selectedOverviewTable,
          date_column: data.date_column ?? null,
          oldest_item_date: data.oldest_item_date ?? null,
          newest_item_date: data.newest_item_date ?? null,
          columns: Array.isArray(data.columns)
            ? data.columns.map((item: { name?: string; declared_type?: string; expected_value?: string }) => ({
              name: item.name ?? '',
              declared_type: item.declared_type ?? 'TEXT',
              expected_value: item.expected_value ?? '',
            }))
            : [],
        })
      } catch (error) {
        console.error('Failed to load table details', error)
        setTableDetailsError(error instanceof Error ? error.message : 'Failed to load table details')
        setTableDetails(null)
      } finally {
        setTableDetailsLoading(false)
      }
    }

    loadTableDetails()
  }, [selectedOverviewTable])

  const selectedSyncPeriod = useMemo(() => {
    if (rangeMode === 'year' && year) {
      return { start: `${year}-01-01`, end: `${year}-12-31` }
    }
    if (rangeMode === 'latest' && overview.latest_date) {
      return { start: overview.latest_date, end: today }
    }
    if (rangeMode === 'custom') {
      return { start: startDate || null, end: endDate || null }
    }
    return { start: null, end: null }
  }, [rangeMode, year, overview.latest_date, today, startDate, endDate])

  const selectedPullKeys = useMemo(() => {
    if (selectedPulls.length === 0) {
      return pullOptions.map((item) => item.value)
    }
    return selectedPulls
  }, [selectedPulls, pullOptions])
  const apiCallBarRows = useMemo(() => {
    const apiMaxByFamily: Record<string, number> = {
      'YouTube Data API v3': 10000,
      'YouTube Analytics API v2': 100000,
    }
    const pullToApiFamily: Record<string, string> = {
      videos: 'YouTube Data API v3',
      comments: 'YouTube Data API v3',
      audience: 'YouTube Data API v3',
      playlists: 'YouTube Data API v3',
      playlist_analytics: 'YouTube Analytics API v2',
      traffic: 'YouTube Analytics API v2',
      channel_analytics: 'YouTube Analytics API v2',
      video_analytics: 'YouTube Analytics API v2',
      video_traffic_source: 'YouTube Analytics API v2',
      video_search_insights: 'YouTube Analytics API v2',
    }
    const pullLabelByKey = Object.fromEntries(pullOptions.map((item) => [item.value, item.label])) as Record<string, string>
    const colorByPull: Record<string, string> = {
      videos: '#0ea5e9',
      comments: '#f97316',
      audience: '#22c55e',
      playlists: '#8b5cf6',
      playlist_analytics: '#ef4444',
      traffic: '#06b6d4',
      channel_analytics: '#eab308',
      video_analytics: '#f43f5e',
      video_traffic_source: '#14b8a6',
      video_search_insights: '#6366f1',
    }
    const rows = [
      { label: 'YouTube Data API v3', segments: [] as { key: string; label: string; value: number; color: string }[] },
      { label: 'YouTube Analytics API v2', segments: [] as { key: string; label: string; value: number; color: string }[] },
    ]
    for (const pullKey of selectedPullKeys) {
      const family = pullToApiFamily[pullKey]
      const value = pullApiCallsByPull[pullKey] ?? 0
      if (!family) {
        continue
      }
      const row = rows.find((item) => item.label === family)
      if (!row) {
        continue
      }
      row.segments.push({
        key: pullKey,
        label: pullLabelByKey[pullKey] ?? pullKey,
        value,
        color: colorByPull[pullKey] ?? '#64748b',
      })
    }
    return rows.map((row) => {
      const total = row.segments.reduce((sum, segment) => sum + segment.value, 0)
      const max = apiMaxByFamily[row.label] ?? 1
      return {
        label: row.label,
        value: total,
        max,
        segments: row.segments.map((segment) => ({
          key: segment.key,
          color: segment.color,
          ratio: max > 0 ? (segment.value / max) * 100 : 0,
          title: `${segment.label}: ${segment.value.toLocaleString()}`,
        })),
        legendItems: row.segments.map((segment) => ({
          key: segment.key,
          label: segment.label,
          value: segment.value,
          color: segment.color,
        })),
      }
    })
  }, [pullApiCallsByPull, pullOptions, selectedPullKeys])

  useEffect(() => {
    async function loadPullApiCalls() {
      if (selectedPullKeys.length === 0) {
        setPullApiCallsByPull({})
        return
      }
      setPullApiCallsLoading(true)
      setPullApiCallsError(null)
      try {
        const pullToTable: Record<string, string> = {
          videos: 'videos',
          comments: 'comments',
          audience: 'audience',
          playlists: 'playlists',
          playlist_analytics: 'playlist_daily_analytics',
          traffic: 'traffic_sources_daily',
          channel_analytics: 'channel_analytics',
          video_analytics: 'video_analytics',
          video_traffic_source: 'video_traffic_source',
          video_search_insights: 'video_search_insights',
        }
        const callsByPull: Record<string, number> = {}
        for (const pullKey of selectedPullKeys) {
          const table = pullToTable[pullKey]
          if (!table) {
            continue
          }
          const params = new URLSearchParams({ table })
          if (selectedSyncPeriod.start) {
            params.set('start_date', selectedSyncPeriod.start)
          }
          if (selectedSyncPeriod.end) {
            params.set('end_date', selectedSyncPeriod.end)
          }
          if (deepSync) {
            params.set('deep_sync', 'true')
          }
          const response = await fetch(`http://127.0.0.1:8000/stats/table-api-calls?${params.toString()}`)
          if (!response.ok) {
            throw new Error(`Failed to load API call estimate (${response.status})`)
          }
          const data = await response.json()
          const count = typeof data.minimum_api_calls === 'number' ? data.minimum_api_calls : 0
          callsByPull[pullKey] = count
        }
        setPullApiCallsByPull(callsByPull)
      } catch (error) {
        console.error('Failed to load API call estimate', error)
        setPullApiCallsError(error instanceof Error ? error.message : 'Failed to load API call estimate')
        setPullApiCallsByPull({})
      } finally {
        setPullApiCallsLoading(false)
      }
    }

    loadPullApiCalls()
  }, [selectedPullKeys, selectedSyncPeriod.start, selectedSyncPeriod.end, deepSync])

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
    setSyncNotice(null)
    setStopRequestedByUser(false)
    setIsSyncing(true)
    setProgress({ is_syncing: true, current_step: 0, max_steps: 0, message: 'Starting sync…', stop_requested: false })
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

  const handleStopSync = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/sync/stop', { method: 'POST' })
      const data = await response.json()
      if (data?.accepted) {
        setStopRequestedByUser(true)
        setSyncNotice('Sync will stop at next API call.')
      }
    } catch (error) {
      console.error('Failed to request sync stop', error)
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
            <div className="sync-action-wrap">
              <ActionButton
                label={isSyncActive ? (isStopPending ? 'Stopping...' : 'Stop sync') : 'Start sync'}
                onClick={isSyncActive ? handleStopSync : handleSync}
                title={isSyncActive ? 'Request stop sync' : 'Start syncing'}
                disabled={(isSyncActive && isStopPending) || (!isSyncActive && invalidSelectedPulls.length > 0)}
                variant={isSyncActive ? 'danger' : 'primary'}
              />
              {isSyncActive && syncNotice ? (
                <span className="sync-stop-tooltip-wrap" aria-label={syncNotice}>
                  <span className="sync-help sync-stop-tooltip-trigger">i</span>
                  <span className="sync-stop-tooltip-bubble">{syncNotice}</span>
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {syncError ? <div className="sync-error-text">{syncError}</div> : null}
      </header>
      <div className="page-body">
        <div className="page-row">
          <div className="sync-table">
            <div className="sync-card-header-row">
              <div className="sync-card-header">Database Overview</div>
              <ActionButton
                label="Refresh"
                onClick={loadOverview}
                variant="soft"
                className="sync-refresh-button"
              />
            </div>
            <div className="db-overview-grid">
              <div className="db-overview-size db-overview-pane">
                <div className="db-overview-pie-wrap">
                  <div className="db-overview-pie-chart">
                    <DonutChart
                      segments={pieSegments.map((segment) => ({
                        key: segment.key,
                        label: segment.label,
                        value: segment.value,
                        color: segment.color,
                      }))}
                      centerLabel="Total size"
                      centerValue={formatBytes(overview.db_size_bytes)}
                      ariaLabel="Table storage distribution"
                      size={220}
                      strokeWidth={24}
                      onHoverChange={setHoveredStorageSegment}
                    />
                  </div>
                </div>
                {pieSegments.length === 0 ? (
                  <div className="sync-storage-empty">No table storage data available.</div>
                ) : (
                  <div className="db-overview-hover">
                    {hoveredStorageSegment ? (
                      <span>{`${hoveredStorageSegment.label}: ${formatBytes(hoveredStorageSegment.value)} (${hoveredStorageSegment.percent.toFixed(2)}%)`}</span>
                    ) : (
                      <span>Hover a slice to see table size and percentage</span>
                    )}
                  </div>
                )}
              </div>
              <div className="db-overview-table-metrics db-overview-pane">
                {orderedTableRowCounts.map((item) => (
                  <div key={item.table} className="db-overview-table-metric">
                    <div className="sync-stat-label-row">
                      <div className="sync-stat-label">{formatTableMetricLabel(item.table)}</div>
                      <span className="sync-help sync-metric-help" title={getTableApiUsage(item.table)}>
                        i
                      </span>
                    </div>
                    <div className="sync-stat-value">{item.rows.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="db-overview-estimate-section">
              <div className="db-overview-api-calls-plain">
                <div className="sync-stat-label">Minimum API calls for selected pulls</div>
                {pullApiCallsLoading ? (
                  <div className="db-overview-api-calls-meta">Loading...</div>
                ) : pullApiCallsError ? (
                  <div className="db-overview-api-calls-meta">{pullApiCallsError}</div>
                ) : (
                  <div className="db-overview-api-calls-breakdown">
                    {apiCallBarRows.map((row) => (
                      <div key={row.label} className="db-overview-api-calls-bar-row">
                        <div className="db-overview-api-calls-row">
                          <span>{row.label}</span>
                          <span>{`${row.value.toLocaleString()} / ${row.max.toLocaleString()}`}</span>
                        </div>
                        <RatioBar length="100%" ratio={100} color="#94a3b8" segments={row.segments} />
                        <div className="db-overview-api-calls-legend">
                          {row.legendItems
                            .filter((item) => item.value > 0)
                            .map((item) => (
                              <div key={item.key} className="db-overview-api-calls-legend-item">
                                <span className="db-overview-api-calls-legend-dot" style={{ backgroundColor: item.color }} />
                                <span className="db-overview-api-calls-legend-label">{item.label}</span>
                                <span className="db-overview-api-calls-legend-value">{item.value.toLocaleString()}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="db-overview-selector-row">
              <ActionButton
                label={showTableColumns ? 'Hide Table Columns' : 'See Table Columns'}
                onClick={() => setShowTableColumns((prev) => !prev)}
                variant="soft"
                className="db-overview-toggle-button"
              />
              <div className="db-overview-selector-label">Database table:</div>
              <div className="db-overview-selector-control">
                <Dropdown
                  value={selectedOverviewTable}
                  onChange={setSelectedOverviewTable}
                  placeholder="Select table"
                  items={overviewTableItems}
                />
              </div>
            </div>
            <div className="db-overview-details">
              <div className="db-overview-date-grid">
                <div className="db-overview-detail-card">
                  <div className="sync-stat-label">Oldest item</div>
                  <div className="sync-stat-value">
                    {tableDetailsLoading ? 'Loading...' : formatDisplayDate(tableDetails?.oldest_item_date ?? null)}
                  </div>
                </div>
                <div className="db-overview-detail-card">
                  <div className="sync-stat-label">Newest item</div>
                  <div className="sync-stat-value">
                    {tableDetailsLoading ? 'Loading...' : formatDisplayDate(tableDetails?.newest_item_date ?? null)}
                  </div>
                </div>
              </div>
              {showTableColumns ? (
                <div className="db-overview-columns-wrap">
                  {tableDetailsError ? (
                    <div className="sync-empty">{tableDetailsError}</div>
                  ) : tableDetailsLoading ? (
                    <div className="sync-empty">Loading columns...</div>
                  ) : (
                    <div className="db-overview-columns-table">
                      <div className="db-overview-columns-header">
                        <span>Column</span>
                        <span>Type</span>
                        <span>Expected values</span>
                      </div>
                      {tableDetails?.columns.length ? (
                        tableDetails.columns.map((column) => (
                          <div key={column.name} className="db-overview-columns-row">
                            <span>{column.name}</span>
                            <span>{column.declared_type}</span>
                            <span>{column.expected_value}</span>
                          </div>
                        ))
                      ) : (
                        <div className="sync-empty">No columns found.</div>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
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
              <span>Range</span>
              <span>Pulls</span>
              <span>Deep Sync</span>
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
                    <span>{run.pulls ? run.pulls : 'All'}</span>
                    <span>{run.deep_sync ? 'Yes' : 'No'}</span>
                    <span className="right">{formatDuration(run.started_at, run.finished_at)}</span>
                    <span className="right">{run.status}</span>
                    <span>
                      {run.error ? (
                        <button
                          type="button"
                          className="sync-error-link"
                          onClick={() => setSelectedRunError({ runId: run.id, text: run.error as string })}
                        >
                          View
                        </button>
                      ) : (
                        '—'
                      )}
                    </span>
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
      {selectedRunError ? (
        <div className="sync-error-modal-overlay" onClick={() => setSelectedRunError(null)}>
          <div className="sync-error-modal" onClick={(event) => event.stopPropagation()}>
            <div className="sync-error-modal-header">
              <div className="sync-card-header">Sync Error</div>
              <ActionButton label="Close" onClick={() => setSelectedRunError(null)} variant="soft" className="sync-refresh-button" />
            </div>
            <textarea className="sync-error-modal-textbox" value={selectedRunError.text} readOnly />
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default SyncSettings

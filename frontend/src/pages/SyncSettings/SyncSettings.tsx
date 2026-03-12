import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActionButton,
  DateRangePicker,
  Dropdown,
  PageSizePicker,
  PageSwitcher,
  TextInput,
  YearInput,
} from '../../components/ui'
import usePagination from '../../hooks/usePagination'
import { ProgressBar, RatioBar } from '../../components/charts'
import { DonutChartCard, PageCard } from '../../components/cards'
import { formatDisplayDate } from '../../utils/date'
import { formatWholeNumber } from '../../utils/number'
import { getStored, setStored } from '../../utils/storage'
import '../shared.css'
import './SyncSettings.css'

const DATA_STAGES = ['videos', 'playlists', 'comments', 'audience']
const ANALYTICS_STAGES = [
  'playlist_analytics',
  'traffic',
  'channel_analytics',
  'video_analytics',
  'video_traffic_source',
  'video_search_insights',
]

const DATA_PULL_OPTIONS = [
  { label: 'Videos', value: 'videos' },
  { label: 'Playlists', value: 'playlists' },
  { label: 'Comments', value: 'comments' },
  { label: 'Audience', value: 'audience' },
]

const ANALYTICS_PULL_OPTIONS = [
  { label: 'Playlist Analytics', value: 'playlist_analytics' },
  { label: 'Traffic sources', value: 'traffic' },
  { label: 'Channel analytics', value: 'channel_analytics' },
  { label: 'Video analytics', value: 'video_analytics' },
  { label: 'Video traffic source', value: 'video_traffic_source' },
  { label: 'Video search insights', value: 'video_search_insights' },
]

function resolveAnalyticsDates(
  rangeMode: string,
  year: string,
  startDate: string,
  endDate: string,
  todayStr: string,
): { start: string | null; end: string | null } {
  if (rangeMode === 'year' && year) return { start: `${year}-01-01`, end: `${year}-12-31` }
  if (rangeMode === 'custom') return { start: startDate || todayStr, end: endDate || todayStr }
  return { start: null, end: null }
}

const PULL_COLORS: Record<string, string> = {
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

function getTableNameFromOption(optionValue: string): string {
  const mapping: Record<string, string> = {
    traffic: 'traffic_sources_daily',
    playlist_analytics: 'playlist_daily_analytics',
  }
  return mapping[optionValue] || optionValue
}

type ApiCallRow = {
  total: number
  max: number
  segments: { key: string; color: string; ratio: number; title: string }[]
  legendItems: { key: string; label: string; value: number; color: string }[]
}

function buildApiCallRow(
  selectedPulls: string[],
  allOptions: { label: string; value: string }[],
  byPull: Record<string, number>,
  max: number,
): ApiCallRow {
  const activePulls =
    selectedPulls.length > 0
      ? selectedPulls.filter((p) => allOptions.some((o) => o.value === p))
      : allOptions.map((o) => o.value)
  const optionLabel = (key: string) => allOptions.find((o) => o.value === key)?.label ?? key
  const total = activePulls.reduce((sum, p) => sum + (byPull[p] ?? 0), 0)
  const visible = activePulls.filter((p) => (byPull[p] ?? 0) > 0)
  return {
    total,
    max,
    segments: visible.map((p) => ({
      key: p,
      color: PULL_COLORS[p] ?? '#64748b',
      ratio: max > 0 ? ((byPull[p] ?? 0) / max) * 100 : 0,
      title: `${optionLabel(p)}: ${(byPull[p] ?? 0).toLocaleString()}`,
    })),
    legendItems: visible.map((p) => ({
      key: p,
      label: optionLabel(p),
      value: byPull[p] ?? 0,
      color: PULL_COLORS[p] ?? '#64748b',
    })),
  }
}

type ProgressState = {
  is_syncing: boolean
  current_step: number
  max_steps: number
  message: string
  stop_requested?: boolean
}

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

function SyncSettings() {
  const today = new Date().toISOString().slice(0, 10)

  type PullConfig = { included: boolean }
  type AnalyticsPullConfig = PullConfig & {
    deepSync: boolean
    rangeMode: string
    year: string
    startDate: string
    endDate: string
  }

  const storedData = getStored(
    'syncSettingsData',
    null as { pullConfigs?: Record<string, { included?: boolean }> } | null,
  )
  const storedAnalytics = getStored(
    'syncSettingsAnalytics',
    null as {
      pullConfigs?: Record<
        string,
        { included?: boolean; deepSync?: boolean; rangeMode?: string; year?: string; startDate?: string; endDate?: string }
      >
    } | null,
  )

  // Data sync state
  const [dataPullConfigs, setDataPullConfigs] = useState<Record<string, PullConfig>>(() => {
    const stored = storedData?.pullConfigs ?? {}
    return Object.fromEntries(
      DATA_STAGES.map((s) => [
        s,
        { included: stored[s]?.included ?? true },
      ]),
    )
  })
  const [dataPullApiCallsLoading, setDataPullApiCallsLoading] = useState(false)
  const [dataPullApiCallsError, setDataPullApiCallsError] = useState<string | null>(null)
  const [dataPullApiCallsByPull, setDataPullApiCallsByPull] = useState<Record<string, number>>({})

  // Analytics sync state
  const [analyticsPullConfigs, setAnalyticsPullConfigs] = useState<
    Record<string, AnalyticsPullConfig>
  >(() => {
    const stored = storedAnalytics?.pullConfigs ?? {}
    return Object.fromEntries(
      ANALYTICS_STAGES.map((s) => [
        s,
        {
          included: stored[s]?.included ?? true,
          deepSync: stored[s]?.deepSync ?? false,
          rangeMode: stored[s]?.rangeMode ?? 'full',
          year: stored[s]?.year ?? '',
          startDate: stored[s]?.startDate ?? today,
          endDate: stored[s]?.endDate ?? today,
        },
      ]),
    )
  })
  const [analyticsPullApiCallsLoading, setAnalyticsPullApiCallsLoading] = useState(false)
  const [analyticsPullApiCallsError, setAnalyticsPullApiCallsError] = useState<string | null>(null)
  const [analyticsPullApiCallsByPull, setAnalyticsPullApiCallsByPull] = useState<
    Record<string, number>
  >({})

  // Competitors sync state
  type CompetitorConfig = { label: string; channel_id: string; enabled: boolean; row_count?: number }
  const [competitorsConfig, setCompetitorsConfig] = useState<Record<string, CompetitorConfig>>({})
  const [competitorsApiCallsLoading, setCompetitorsApiCallsLoading] = useState(false)
  const [competitorsApiCallsError, setCompetitorsApiCallsError] = useState<string | null>(null)
  const [competitorsApiCalls, setCompetitorsApiCalls] = useState(0)

  // Table column counts
  const [tableRowCounts, setTableRowCounts] = useState<Record<string, number>>({})

  // Table storage
  const [tableStorage, setTableStorage] = useState<Array<{ table: string; bytes: number; percent: number }>>([])
  const [totalStorageBytes, setTotalStorageBytes] = useState(0)

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
  const [selectedRunError, setSelectedRunError] = useState<{
    runId: number
    text: string
  } | null>(null)
  const [resettingTableName, setResettingTableName] = useState<string | null>(null)

  // Derived sync state
  const progressState: ProgressState | null =
    progress ??
    (isSyncing
      ? {
          is_syncing: true,
          current_step: 0,
          max_steps: 0,
          message: 'Starting sync…',
          stop_requested: false,
        }
      : null)
  const isSyncActive = Boolean(progressState?.is_syncing) || isSyncing
  const isStopPending = Boolean(stopRequestedByUser || progressState?.stop_requested)

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
      if (!res.ok) {
        console.error(`API error: ${res.status} ${res.statusText}`)
        return
      }
      const data = await res.json()

      // Table row counts
      const rowCountsList = data.table_row_counts || []
      const rowCountsMap: Record<string, number> = {}
      rowCountsList.forEach((item: { table: string; rows: number }) => {
        rowCountsMap[item.table] = item.rows
      })
      setTableRowCounts(rowCountsMap)

      // Table storage
      const storageList = data.table_storage || []
      const total = storageList.reduce((sum: number, item: { bytes: number }) => sum + (item.bytes || 0), 0)
      setTableStorage(storageList)
      setTotalStorageBytes(total)
    } catch (error) {
      console.error('Failed to refresh table data:', error)
    }
  }, [])

  useEffect(() => {
    loadRuns()
  }, [loadRuns])

  useEffect(() => {
    setStored('syncSettingsData', { pullConfigs: dataPullConfigs })
  }, [dataPullConfigs])

  useEffect(() => {
    setStored('syncSettingsAnalytics', { pullConfigs: analyticsPullConfigs })
  }, [analyticsPullConfigs])

  useEffect(() => {
    if (!isSyncActive) {
      setStopRequestedByUser(false)
    }
  }, [isSyncActive])

  useEffect(() => {
    const fetchTableData = async () => {
      try {
        const res = await fetch('http://localhost:8000/stats/overview')
        if (!res.ok) {
          console.error(`API error: ${res.status} ${res.statusText}`)
          return
        }
        const data = await res.json()

        // Table row counts
        const rowCountsList = data.table_row_counts || []
        const rowCountsMap: Record<string, number> = {}
        rowCountsList.forEach((item: { table: string; rows: number }) => {
          rowCountsMap[item.table] = item.rows
        })
        setTableRowCounts(rowCountsMap)

        // Table storage
        const storageList = data.table_storage || []
        const total = storageList.reduce((sum: number, item: { bytes: number }) => sum + (item.bytes || 0), 0)
        setTableStorage(storageList)
        setTotalStorageBytes(total)
      } catch (error) {
        console.error('Failed to fetch table data:', error)
      }
    }

    fetchTableData()
  }, [])

  const analyticsSyncPeriodForEstimate = useMemo(() => {
    const included = ANALYTICS_STAGES.filter(
      (s) => analyticsPullConfigs[s]?.included !== false,
    )
    const starts = included
      .map((s) => resolveAnalyticsDates(
        analyticsPullConfigs[s].rangeMode,
        analyticsPullConfigs[s].year,
        analyticsPullConfigs[s].startDate,
        analyticsPullConfigs[s].endDate,
        today,
      ).start)
      .filter((v): v is string => v !== null)
    const ends = included
      .map((s) => resolveAnalyticsDates(
        analyticsPullConfigs[s].rangeMode,
        analyticsPullConfigs[s].year,
        analyticsPullConfigs[s].startDate,
        analyticsPullConfigs[s].endDate,
        today,
      ).end)
      .filter((v): v is string => v !== null)
    return {
      start: starts.length === included.length ? [...starts].sort()[0] : null,
      end: ends.length === included.length ? [...ends].sort().reverse()[0] : null,
    }
  }, [analyticsPullConfigs, today])

  useEffect(() => {
    let active = true
    async function load() {
      const pulls = DATA_STAGES.filter((s) => dataPullConfigs[s]?.included !== false)
      if (pulls.length === 0) {
        setDataPullApiCallsByPull({})
        setDataPullApiCallsLoading(false)
        return
      }
      setDataPullApiCallsLoading(true)
      setDataPullApiCallsError(null)
      try {
        const params = new URLSearchParams({ pull: pulls.join(',') })
        const response = await fetch(`http://localhost:8000/sync/data/estimate?${params}`)
        if (!response.ok) throw new Error(`Request failed (${response.status})`)
        const data = await response.json()
        if (active) {
          setDataPullApiCallsByPull(
            typeof data.by_pull === 'object' && data.by_pull
              ? (data.by_pull as Record<string, number>)
              : {},
          )
        }
      } catch (error) {
        if (active) {
          setDataPullApiCallsError(
            error instanceof Error ? error.message : 'Failed to load estimate',
          )
          setDataPullApiCallsByPull({})
        }
      } finally {
        if (active) setDataPullApiCallsLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [dataPullConfigs])

  useEffect(() => {
    let active = true
    async function load() {
      const pulls = ANALYTICS_STAGES.filter((s) => analyticsPullConfigs[s]?.included !== false)
      if (pulls.length === 0) {
        setAnalyticsPullApiCallsByPull({})
        setAnalyticsPullApiCallsLoading(false)
        return
      }
      setAnalyticsPullApiCallsLoading(true)
      setAnalyticsPullApiCallsError(null)
      try {
        const anyDeepSync = pulls.some((s) => analyticsPullConfigs[s]?.deepSync)
        const params = new URLSearchParams({ pull: pulls.join(',') })
        if (analyticsSyncPeriodForEstimate.start)
          params.set('start_date', analyticsSyncPeriodForEstimate.start)
        if (analyticsSyncPeriodForEstimate.end)
          params.set('end_date', analyticsSyncPeriodForEstimate.end)
        if (anyDeepSync) params.set('deep_sync', 'true')
        const response = await fetch(`http://localhost:8000/sync/analytics/estimate?${params}`)
        if (!response.ok) throw new Error(`Request failed (${response.status})`)
        const data = await response.json()
        if (active) {
          setAnalyticsPullApiCallsByPull(
            typeof data.by_pull === 'object' && data.by_pull
              ? (data.by_pull as Record<string, number>)
              : {},
          )
        }
      } catch (error) {
        if (active) {
          setAnalyticsPullApiCallsError(
            error instanceof Error ? error.message : 'Failed to load estimate',
          )
          setAnalyticsPullApiCallsByPull({})
        }
      } finally {
        if (active) setAnalyticsPullApiCallsLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [analyticsPullConfigs, analyticsSyncPeriodForEstimate.start, analyticsSyncPeriodForEstimate.end])

  const dataApiCallRow = useMemo(() => {
    const includedPulls = DATA_STAGES.filter((s) => dataPullConfigs[s]?.included !== false)
    return buildApiCallRow(includedPulls, DATA_PULL_OPTIONS, dataPullApiCallsByPull, 10000)
  }, [dataPullConfigs, dataPullApiCallsByPull])
  const analyticsApiCallRow = useMemo(() => {
    const includedPulls = ANALYTICS_STAGES.filter(
      (s) => analyticsPullConfigs[s]?.included !== false,
    )
    return buildApiCallRow(includedPulls, ANALYTICS_PULL_OPTIONS, analyticsPullApiCallsByPull, 100000)
  }, [analyticsPullConfigs, analyticsPullApiCallsByPull])

  const computeProgress = () => {
    if (!progressState?.max_steps) return 0
    return Math.max(
      0,
      Math.min(100, (Math.max(0, progressState.current_step) / progressState.max_steps) * 100),
    )
  }

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

  const toggleDataConfig = (stage: string, key: 'included') => {
    setDataPullConfigs((prev) => ({
      ...prev,
      [stage]: { ...prev[stage], [key]: !prev[stage][key] },
    }))
  }

  const toggleAnalyticsConfig = (stage: string, key: 'included' | 'deepSync') => {
    setAnalyticsPullConfigs((prev) => ({
      ...prev,
      [stage]: { ...prev[stage], [key]: !prev[stage][key] },
    }))
  }

  const setAnalyticsDateField = (
    stage: string,
    field: 'rangeMode' | 'year' | 'startDate' | 'endDate',
    value: string,
  ) => {
    setAnalyticsPullConfigs((prev) => ({
      ...prev,
      [stage]: { ...prev[stage], [field]: value },
    }))
  }

  const handleDataSync = async () => {
    const items = DATA_STAGES.filter((s) => dataPullConfigs[s]?.included !== false).map((s) => ({
      stage: s,
    }))
    if (items.length === 0) return
    setStopRequestedByUser(false)
    setIsSyncing(true)
    setProgress({
      is_syncing: true,
      current_step: 0,
      max_steps: 0,
      message: 'Starting data sync…',
      stop_requested: false,
    })
    try {
      const response = await fetch('http://localhost:8000/sync/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
    } catch (error) {
      console.error('Failed to start data sync', error)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleAnalyticsSync = async () => {
    const items = ANALYTICS_STAGES.filter(
      (s) => analyticsPullConfigs[s]?.included !== false,
    ).map((s) => {
      const cfg = analyticsPullConfigs[s]
      const { start, end } = resolveAnalyticsDates(
        cfg.rangeMode, cfg.year, cfg.startDate, cfg.endDate, today,
      )
      return { stage: s, deep_sync: cfg.deepSync, start_date: start, end_date: end }
    })
    if (items.length === 0) {
      return
    }
    setStopRequestedByUser(false)
    setIsSyncing(true)
    setProgress({
      is_syncing: true,
      current_step: 0,
      max_steps: 0,
      message: 'Starting analytics sync…',
      stop_requested: false,
    })
    try {
      const body: Record<string, unknown> = { items }
      const response = await fetch('http://localhost:8000/sync/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (response.status === 409) {
        // A sync is already running
      }
    } catch (error) {
      console.error('Failed to start analytics sync', error)
    } finally {
      setIsSyncing(false)
    }
  }

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

  const handleResetTable = async (tableName: string) => {
    if (!confirm(`Are you sure you want to reset the ${tableName} table? This will delete all data and recreate the table.`)) {
      return
    }
    setResettingTableName(tableName)
    try {
      const response = await fetch('http://localhost:8000/sync/reset-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_name: tableName }),
      })
      if (!response.ok) {
        throw new Error(`Reset failed: ${response.status}`)
      }
      await loadRuns()
    } catch (error) {
      console.error('Failed to reset table', error)
      alert(`Failed to reset table: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setResettingTableName(null)
    }
  }

  // Load competitors from backend
  useEffect(() => {
    const loadCompetitors = async () => {
      try {
        const response = await fetch('http://localhost:8000/competitors')
        const data = await response.json()
        setCompetitorsConfig(data || {})
      } catch (error) {
        console.error('Failed to load competitors', error)
      }
    }
    loadCompetitors()
  }, [])

  // Save competitors to backend
  useEffect(() => {
    const saveCompetitors = async () => {
      try {
        await fetch('http://localhost:8000/competitors', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(competitorsConfig),
        })
      } catch (error) {
        console.error('Failed to save competitors', error)
      }
    }
    if (Object.keys(competitorsConfig).length > 0) {
      saveCompetitors()
    }
  }, [competitorsConfig])

  // Fetch competitors API estimate
  useEffect(() => {
    const enabledCount = Object.values(competitorsConfig).filter((c) => c.enabled).length
    if (enabledCount === 0) {
      setCompetitorsApiCalls(0)
      return
    }
    let active = true
    async function load() {
      setCompetitorsApiCallsLoading(true)
      setCompetitorsApiCallsError(null)
      try {
        const response = await fetch('http://localhost:8000/competitors')
        if (!response.ok) throw new Error(`Request failed (${response.status})`)
        const data = await response.json()
        if (active) {
          const enabledCompetitors = Object.values(data).filter((c: CompetitorConfig) => c.enabled)
          setCompetitorsApiCalls(enabledCompetitors.length * 4)
        }
      } catch (error) {
        if (active) {
          setCompetitorsApiCallsError(
            error instanceof Error ? error.message : 'Failed to load estimate',
          )
        }
      } finally {
        if (active) {
          setCompetitorsApiCallsLoading(false)
        }
      }
    }
    load()
    return () => {
      active = false
    }
  }, [competitorsConfig])

  const updateCompetitor = (index: number, field: 'label' | 'channel_id' | 'enabled', value: string | boolean) => {
    const entries = Object.entries(competitorsConfig)
    if (index < 0 || index >= entries.length) return
    const [key, config] = entries[index]
    setCompetitorsConfig((prev) => ({
      ...prev,
      [key]: { ...config, [field]: value },
    }))
  }

  const removeCompetitor = (index: number) => {
    const entries = Object.entries(competitorsConfig)
    if (index < 0 || index >= entries.length) return
    const [key] = entries[index]
    setCompetitorsConfig((prev) => {
      const updated = { ...prev }
      delete updated[key]
      return updated
    })
  }

  const handleCompetitorsSync = async () => {
    const enabledCount = Object.values(competitorsConfig).filter((c) => c.enabled).length
    if (enabledCount === 0) {
      alert('No competitors enabled')
      return
    }
    setStopRequestedByUser(false)
    setIsSyncing(true)
    setProgress({
      is_syncing: true,
      current_step: 0,
      max_steps: 0,
      message: 'Starting competitors sync…',
      stop_requested: false,
    })
    try {
      const response = await fetch('http://localhost:8000/sync/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (response.status === 409) {
        // A sync is already running
      }
    } catch (error) {
      console.error('Failed to start competitors sync', error)
    } finally {
      setIsSyncing(false)
    }
  }

  const competitorsApiCallRow = useMemo(() => {
    return {
      total: competitorsApiCalls,
      max: 10000,
      segments: competitorsApiCalls > 0 ? [
        {
          key: 'competitors',
          color: '#a78bfa',
          ratio: Math.min(100, (competitorsApiCalls / 10000) * 100),
          title: `Competitors: ${competitorsApiCalls.toLocaleString()}`,
        },
      ] : [],
      legendItems: competitorsApiCalls > 0 ? [
        {
          key: 'competitors',
          label: 'Competitors',
          value: competitorsApiCalls,
          color: '#a78bfa',
        },
      ] : [],
    }
  }, [competitorsApiCalls])

  const addCompetitor = () => {
    const timestamp = Date.now()
    setCompetitorsConfig((prev) => ({
      ...prev,
      [`competitor_${timestamp}`]: {
        label: '',
        channel_id: '',
        enabled: true,
        row_count: 0,
      },
    }))
  }

  const refreshCompetitorsData = async () => {
    try {
      const response = await fetch('http://localhost:8000/competitors')
      const data = await response.json()
      setCompetitorsConfig(data || {})
    } catch (error) {
      console.error('Failed to refresh competitors data', error)
    }
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

  const renderEstimate = (
    apiLabel: string,
    loading: boolean,
    error: string | null,
    row: ApiCallRow,
  ) => (
    <div className="sync-estimate-section">
      {loading ? (
        <div className="sync-estimate-meta">Loading...</div>
      ) : error ? (
        <div className="sync-estimate-meta">{error}</div>
      ) : (
        <div className="sync-estimate-bar-row">
          <div className="sync-estimate-bar-header">
            <span className="sync-estimate-api-label">Estimate {apiLabel} API Calls</span>
            <span>{`${row.total.toLocaleString()} / ${row.max.toLocaleString()}`}</span>
          </div>
          <RatioBar length="100%" ratio={100} color="#94a3b8" segments={row.segments} />
          <div className="sync-estimate-legend">
            {row.legendItems.map((item) => (
              <div key={item.key} className="sync-estimate-legend-item">
                <span
                  className="sync-estimate-legend-dot"
                  style={{ backgroundColor: item.color }}
                />
                <span className="sync-estimate-legend-label">{item.label}</span>
                <span className="sync-estimate-legend-value">{item.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <section className="page">
      <header className="page-header">
        <div className="header-text">
          <h1>Sync</h1>
        </div>
      </header>
      <div className="page-body">
        {/* Table Storage Card */}
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

        {/* Data Sync Card */}
        <div className="page-row">
          <div className="sync-card">
            <div className="sync-card-header-row">
              <div className="sync-card-header">Data Sync</div>
              <span className="sync-api-badge">YouTube Data API v3</span>
              <ActionButton
                label="Refresh"
                onClick={refreshTableData}
                variant="soft"
              />
              <ActionButton
                label={
                  isSyncActive
                    ? isStopPending
                      ? 'Stopping...'
                      : 'Stop sync'
                    : 'Start sync'
                }
                onClick={isSyncActive ? handleStopSync : handleDataSync}
                disabled={isStopPending}
                variant={isSyncActive ? 'danger' : 'primary'}
              />
            </div>
            <div className="sync-controls">
              <div className="sync-stage-table">
                {DATA_PULL_OPTIONS.map((opt) => {
                  const cfg = dataPullConfigs[opt.value]
                  return (
                    <div key={opt.value} className="sync-stage-row">
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <span className="sync-stage-label">{opt.label}</span>
                        <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                          {formatWholeNumber(tableRowCounts[opt.value] || 0)} rows
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginLeft: 'auto' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--color-muted)' }}>
                          <input
                            type="checkbox"
                            checked={cfg.included}
                            onChange={() => toggleDataConfig(opt.value, 'included')}
                          />
                          Include
                        </label>
                        <ActionButton
                          label={resettingTableName === opt.value ? 'Resetting...' : 'Reset'}
                          onClick={() => handleResetTable(opt.value)}
                          disabled={resettingTableName === opt.value}
                          variant="danger"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            {renderEstimate(
              'YouTube Data API v3',
              dataPullApiCallsLoading,
              dataPullApiCallsError,
              dataApiCallRow,
            )}
          </div>
        </div>

        {/* Analytics Sync Card */}
        <div className="page-row">
          <div className="sync-card">
            <div className="sync-card-header-row">
              <div className="sync-card-header">Analytics Sync</div>
              <span className="sync-api-badge">YouTube Analytics API v2</span>
              <ActionButton
                label="Refresh"
                onClick={refreshTableData}
                variant="soft"
              />
              <ActionButton
                label={
                  isSyncActive
                    ? isStopPending
                      ? 'Stopping...'
                      : 'Stop sync'
                    : 'Start sync'
                }
                onClick={isSyncActive ? handleStopSync : handleAnalyticsSync}
                disabled={isStopPending}
                variant={isSyncActive ? 'danger' : 'primary'}
              />
            </div>
            <div className="sync-controls">
              <div className="sync-stage-table">
                {ANALYTICS_PULL_OPTIONS.map((opt) => {
                  const cfg = analyticsPullConfigs[opt.value]
                  const tableName = getTableNameFromOption(opt.value)
                  return (
                    <div key={opt.value} className="sync-stage-row">
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <span className="sync-stage-label">{opt.label}</span>
                        <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                          {formatWholeNumber(tableRowCounts[tableName] || 0)} rows
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginLeft: 'auto' }}>
                        {cfg.included ? (
                          <div className="sync-stage-date-controls">
                            <Dropdown
                              value={cfg.rangeMode}
                              onChange={(v) => setAnalyticsDateField(opt.value, 'rangeMode', v)}
                              placeholder="Full data"
                              items={[
                                { type: 'option' as const, label: 'Full data', value: 'full' },
                                { type: 'option' as const, label: 'Year', value: 'year' },
                                { type: 'option' as const, label: 'Custom range', value: 'custom' },
                              ]}
                            />
                            {cfg.rangeMode === 'year' ? (
                              <YearInput
                                value={cfg.year}
                                onChange={(v) => setAnalyticsDateField(opt.value, 'year', v)}
                              />
                            ) : null}
                            {cfg.rangeMode === 'custom' ? (
                              <DateRangePicker
                                startDate={cfg.startDate}
                                endDate={cfg.endDate}
                                onChange={(start, end) => {
                                  setAnalyticsDateField(opt.value, 'startDate', start)
                                  setAnalyticsDateField(opt.value, 'endDate', end)
                                }}
                              />
                            ) : null}
                          </div>
                        ) : null}
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--color-muted)' }}>
                          <input
                            type="checkbox"
                            checked={cfg.included}
                            onChange={() => toggleAnalyticsConfig(opt.value, 'included')}
                          />
                          Include
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: cfg.deepSync ? '#1e293b' : 'var(--color-muted)' }}>
                          <input
                            type="checkbox"
                            checked={cfg.deepSync}
                            disabled={!cfg.included}
                            onChange={() => toggleAnalyticsConfig(opt.value, 'deepSync')}
                          />
                          Deep Sync
                        </label>
                        <ActionButton
                          label={resettingTableName === tableName ? 'Resetting...' : 'Reset'}
                          onClick={() => handleResetTable(tableName)}
                          disabled={resettingTableName === tableName}
                          variant="danger"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            {renderEstimate(
              'YouTube Analytics API v2',
              analyticsPullApiCallsLoading,
              analyticsPullApiCallsError,
              analyticsApiCallRow,
            )}
          </div>
        </div>

        {/* Competitors Sync Card */}
        <div className="page-row">
          <div className="sync-card">
            <div className="sync-card-header-row">
              <div className="sync-card-header">Competitors Sync</div>
              <span className="sync-api-badge">YouTube Data API v3</span>
              <ActionButton
                label="Refresh"
                onClick={refreshCompetitorsData}
                variant="soft"
              />
              <ActionButton
                label="Add"
                onClick={addCompetitor}
                variant="soft"
              />
              <ActionButton
                label={
                  isSyncActive
                    ? isStopPending
                      ? 'Stopping...'
                      : 'Stop sync'
                    : 'Start sync'
                }
                onClick={isSyncActive ? handleStopSync : handleCompetitorsSync}
                disabled={isStopPending}
                variant={isSyncActive ? 'danger' : 'primary'}
              />
            </div>
            <div className="sync-controls">
              <div className="sync-stage-table">
                {Object.entries(competitorsConfig).map(([key, config], index) => (
                  <div key={key} className="sync-stage-row" style={{ gap: '12px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1, minWidth: 0 }}>
                      <TextInput
                        value={config.label}
                        onChange={(v) => updateCompetitor(index, 'label', v)}
                        placeholder="Channel name"
                        disableNewlines
                        width="150px"
                        height="36px"
                      />
                      <TextInput
                        value={config.channel_id}
                        onChange={(v) => updateCompetitor(index, 'channel_id', v)}
                        placeholder="Channel ID"
                        disableNewlines
                        width="200px"
                        height="36px"
                      />
                      <span style={{ fontSize: '12px', color: 'var(--color-muted)', minWidth: '60px' }}>
                        {formatWholeNumber(config.row_count || 0)} rows
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginLeft: 'auto' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--color-muted)' }}>
                        <input
                          type="checkbox"
                          checked={config.enabled}
                          onChange={(e) => updateCompetitor(index, 'enabled', e.target.checked)}
                        />
                        Include
                      </label>
                      <ActionButton
                        label="-"
                        onClick={() => removeCompetitor(index)}
                        variant="danger"
                        style={{ minWidth: '44px', padding: '0' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {renderEstimate(
              'YouTube Data API v3',
              competitorsApiCallsLoading,
              competitorsApiCallsError,
              competitorsApiCallRow,
            )}
          </div>
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
                            onClick={() =>
                              setSelectedRunError({ runId: run.id, text: run.error as string })
                            }
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

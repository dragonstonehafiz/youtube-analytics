import { useEffect, useMemo, useState } from 'react'
import { ActionButton, DateRangePicker, Dropdown, YearInput } from '../../components/ui'
import { formatWholeNumber } from '../../utils/number'
import { getStored, setStored } from '../../utils/storage'
import { buildApiCallRow } from './utils'
import SyncEstimatePanel from './SyncEstimatePanel'
import SyncTabHeader from './SyncTabHeader'

const ANALYTICS_STAGES = [
  'playlist_analytics',
  'traffic',
  'channel_analytics',
  'video_analytics',
  'video_traffic_source',
  'video_search_insights',
]

const ANALYTICS_PULL_OPTIONS = [
  { label: 'Playlist Analytics', value: 'playlist_analytics' },
  { label: 'Traffic sources', value: 'traffic' },
  { label: 'Channel analytics', value: 'channel_analytics' },
  { label: 'Video analytics', value: 'video_analytics' },
  { label: 'Video traffic source', value: 'video_traffic_source' },
  { label: 'Video search insights', value: 'video_search_insights' },
]

const PULL_COLORS: Record<string, string> = {
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

type Props = {
  isSyncActive: boolean
  isStopPending: boolean
  onStopSync: () => void
  onStartSyncRequest: (message: string, request: () => Promise<void>) => Promise<void>
  tableRowCounts: Record<string, number>
  resettingTableName: string | null
  onResetTable: (name: string) => void
  onRefresh: () => void
}

function AnalyticsSyncTab({
  isSyncActive,
  isStopPending,
  onStopSync,
  onStartSyncRequest,
  tableRowCounts,
  resettingTableName,
  onResetTable,
  onRefresh,
}: Props) {
  const today = new Date().toISOString().slice(0, 10)

  type AnalyticsPullConfig = {
    included: boolean
    deepSync: boolean
    rangeMode: string
    year: string
    startDate: string
    endDate: string
  }

  const storedAnalytics = getStored(
    'syncSettingsAnalytics',
    null as {
      pullConfigs?: Record<
        string,
        { included?: boolean; deepSync?: boolean; rangeMode?: string; year?: string; startDate?: string; endDate?: string }
      >
    } | null,
  )

  const [analyticsPullConfigs, setAnalyticsPullConfigs] = useState<Record<string, AnalyticsPullConfig>>(() => {
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
  const [apiCallsLoading, setApiCallsLoading] = useState(false)
  const [apiCallsError, setApiCallsError] = useState<string | null>(null)
  const [apiCallsByPull, setApiCallsByPull] = useState<Record<string, number>>({})

  useEffect(() => {
    setStored('syncSettingsAnalytics', { pullConfigs: analyticsPullConfigs })
  }, [analyticsPullConfigs])

  const analyticsSyncPeriodForEstimate = useMemo(() => {
    const included = ANALYTICS_STAGES.filter((s) => analyticsPullConfigs[s]?.included !== false)
    const starts = included
      .map((s) =>
        resolveAnalyticsDates(
          analyticsPullConfigs[s].rangeMode,
          analyticsPullConfigs[s].year,
          analyticsPullConfigs[s].startDate,
          analyticsPullConfigs[s].endDate,
          today,
        ).start,
      )
      .filter((v): v is string => v !== null)
    const ends = included
      .map((s) =>
        resolveAnalyticsDates(
          analyticsPullConfigs[s].rangeMode,
          analyticsPullConfigs[s].year,
          analyticsPullConfigs[s].startDate,
          analyticsPullConfigs[s].endDate,
          today,
        ).end,
      )
      .filter((v): v is string => v !== null)
    return {
      start: starts.length === included.length ? [...starts].sort()[0] : null,
      end: ends.length === included.length ? [...ends].sort().reverse()[0] : null,
    }
  }, [analyticsPullConfigs, today])

  useEffect(() => {
    let active = true
    async function load() {
      const pulls = ANALYTICS_STAGES.filter((s) => analyticsPullConfigs[s]?.included !== false)
      if (pulls.length === 0) {
        setApiCallsByPull({})
        setApiCallsLoading(false)
        return
      }
      setApiCallsLoading(true)
      setApiCallsError(null)
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
  }, [analyticsPullConfigs, analyticsSyncPeriodForEstimate.start, analyticsSyncPeriodForEstimate.end])

  const apiCallRow = useMemo(() => {
    const includedPulls = ANALYTICS_STAGES.filter((s) => analyticsPullConfigs[s]?.included !== false)
    return buildApiCallRow(includedPulls, ANALYTICS_PULL_OPTIONS, apiCallsByPull, 100000, PULL_COLORS)
  }, [analyticsPullConfigs, apiCallsByPull])

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

  const handleSync = async () => {
    const items = ANALYTICS_STAGES.filter((s) => analyticsPullConfigs[s]?.included !== false).map((s) => {
      const cfg = analyticsPullConfigs[s]
      const { start, end } = resolveAnalyticsDates(cfg.rangeMode, cfg.year, cfg.startDate, cfg.endDate, today)
      return { stage: s, deep_sync: cfg.deepSync, start_date: start, end_date: end }
    })
    if (items.length === 0) return
    await onStartSyncRequest('Starting analytics sync…', async () => {
      await fetch('http://localhost:8000/sync/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
    })
  }

  return (
    <div className="sync-card">
      <SyncTabHeader
        title="Analytics Sync"
        apiBadge="YouTube Analytics API v2"
        isSyncActive={isSyncActive}
        isStopPending={isStopPending}
        onStopSync={onStopSync}
        onStartSync={handleSync}
        onRefresh={onRefresh}
      />
      <table className="sync-table">
        <thead>
          <tr>
            <th className="sync-col-w-120">Table Name</th>
            <th className="sync-col-w-120">Row Count</th>
            <th className="sync-col-w-400">Period</th>
            <th className="sync-col-w-60">Include</th>
            <th className="sync-col-w-60">Deep Sync</th>
            <th className="sync-col-w-60"></th>
          </tr>
        </thead>
        <tbody>
          {ANALYTICS_PULL_OPTIONS.map((opt) => {
            const cfg = analyticsPullConfigs[opt.value]
            const tableName = getTableNameFromOption(opt.value)
            return (
              <tr key={opt.value}>
                <td className="sync-stage-label">{opt.label}</td>
                <td className="sync-row-count">{formatWholeNumber(tableRowCounts[tableName] || 0)} rows</td>
                <td>
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
                      {cfg.rangeMode === 'year' && (
                        <YearInput
                          value={cfg.year}
                          onChange={(v) => setAnalyticsDateField(opt.value, 'year', v)}
                        />
                      )}
                      {cfg.rangeMode === 'custom' && (
                        <DateRangePicker
                          startDate={cfg.startDate}
                          endDate={cfg.endDate}
                          onChange={(start, end) => {
                            setAnalyticsDateField(opt.value, 'startDate', start)
                            setAnalyticsDateField(opt.value, 'endDate', end)
                          }}
                        />
                      )}
                    </div>
                  ) : null}
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={cfg.included}
                    onChange={() => toggleAnalyticsConfig(opt.value, 'included')}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={cfg.deepSync}
                    disabled={!cfg.included}
                    onChange={() => toggleAnalyticsConfig(opt.value, 'deepSync')}
                  />
                </td>
                <td>
                  <ActionButton
                    label={resettingTableName === tableName ? 'Deleting...' : 'Delete'}
                    onClick={() => onResetTable(tableName)}
                    disabled={resettingTableName === tableName}
                    variant="danger"
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <SyncEstimatePanel
        loading={apiCallsLoading}
        error={apiCallsError}
        apiLabel="Estimate YouTube Analytics API v2 API Calls"
        apiCallRow={apiCallRow}
      />
    </div>
  )
}

export default AnalyticsSyncTab

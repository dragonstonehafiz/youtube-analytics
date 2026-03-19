import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataRangeControl, type DateRangeValue } from '@components/features'
import { fetchChannelYears } from '@utils/years'
import { MetricsTab, EngagementTab, MonetizationTab, DiscoveryTab, InsightsTab } from '@tabs'
import { getStored, setStored } from '@utils/storage'
import { formatWholeNumber, formatDuration } from '@utils/number'
import { formatDisplayDate } from '@utils/date'
import { useChannelAnalytics } from '@hooks/useChannelAnalytics'
import type { PublishedItem } from '@components/charts'
import type { VideoDetailListItem } from '@components/cards'
import type { TopContentItem } from '@components/tables'
import type { TabDataSource, DiscoveryDataSource } from '@types'
import type { TrafficSourceRow } from '@utils/trafficSeries'
import '../shared.css'
import './Analytics.css'

type AnalyticsTab = 'metrics' | 'engagement' | 'monetization' | 'discovery' | 'insights'

const CONTENT_OPTIONS = [
  { label: 'All Videos', value: 'all' },
  { label: 'Longform', value: 'video' },
  { label: 'Shortform', value: 'short' },
]

const EMPTY_RANGE = { start: '', end: '' }

function Analytics() {
  const navigate = useNavigate()
  const initialAnalyticsTab = getStored('analyticsTab', 'metrics') as string
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>(
    (['metrics', 'engagement', 'monetization', 'discovery', 'insights'] as string[]).includes(initialAnalyticsTab) ? initialAnalyticsTab as AnalyticsTab : 'metrics'
  )
  const [contentSelection, setContentSelection] = useState(getStored('analyticsContentSelection', 'all'))
  const [rangeValue, setRangeValue] = useState<DateRangeValue | null>(null)
  const [years, setYears] = useState<string[]>([])
  const [publishedDatesDaily, setPublishedDatesDaily] = useState<Record<string, PublishedItem[]>>({})
  const [topContent, setTopContent] = useState<TopContentItem[]>([])
  const [latestLongform, setLatestLongform] = useState<VideoDetailListItem[]>([])
  const [latestShorts, setLatestShorts] = useState<VideoDetailListItem[]>([])
  const [trafficRows, setTrafficRows] = useState<TrafficSourceRow[]>([])
  const [previousTrafficRows, setPreviousTrafficRows] = useState<TrafficSourceRow[]>([])

  const range = rangeValue?.range ?? EMPTY_RANGE
  const previousRange = rangeValue?.previousRange ?? EMPTY_RANGE

  const { rows: channelRows, previousRows: channelPreviousRows, totals: channelTotals } = useChannelAnalytics(
    contentSelection,
    range,
    previousRange,
    { skip: !rangeValue },
  )

  const selectedSourceIndex = CONTENT_OPTIONS.findIndex((o) => o.value === contentSelection)

  const discoveryDataSources = useMemo<DiscoveryDataSource[]>(() => CONTENT_OPTIONS.map((opt, i) => ({
    label: opt.label,
    trafficRows: i === selectedSourceIndex ? trafficRows : [],
    previousTrafficRows: i === selectedSourceIndex ? previousTrafficRows : [],
    videoIds: [],
    publishedDates: i === selectedSourceIndex ? publishedDatesDaily : undefined,
    contentType: opt.value,
  })), [selectedSourceIndex, trafficRows, previousTrafficRows, publishedDatesDaily])

  const tabDataSources = useMemo<TabDataSource[]>(() => CONTENT_OPTIONS.map((opt, i) => ({
    label: opt.label,
    dailyRows: i === selectedSourceIndex ? channelRows : [],
    previousDailyRows: i === selectedSourceIndex ? channelPreviousRows : [],
    videoIds: [],
    totals: i === selectedSourceIndex ? channelTotals as Record<string, number | null> : undefined,
    publishedDates: i === selectedSourceIndex ? publishedDatesDaily : undefined,
    contentType: opt.value,
    dataSourceLevel: opt.value === 'all' ? 'channel' : 'video',
  })), [selectedSourceIndex, channelRows, channelPreviousRows, channelTotals, publishedDatesDaily])

  useEffect(() => {
    fetchChannelYears().then(setYears).catch(() => {})
  }, [])

  useEffect(() => {
    if (!rangeValue) return
    const { start, end } = rangeValue.range
    async function loadPublished() {
      try {
        const contentParam = contentSelection === 'all' ? '' : `&content_type=${contentSelection}`
        const response = await fetch(`http://localhost:8000/videos/published?start_date=${start}&end_date=${end}${contentParam}`)
        const data = await response.json()
        const items = Array.isArray(data.items) ? (data.items as Array<{ day: string; items: PublishedItem[] }>) : []
        const map: Record<string, PublishedItem[]> = {}
        items.forEach((item) => { if (item.day) map[item.day] = Array.isArray(item.items) ? item.items : [] })
        setPublishedDatesDaily(map)
      } catch {
        // ignore — published markers are non-critical
      }
    }
    loadPublished()
  }, [rangeValue, contentSelection])

  useEffect(() => {
    if (!rangeValue) return
    async function loadTraffic() {
      try {
        const toRows = (items: Array<{ day?: string; traffic_source?: string; views?: number; watch_time_minutes?: number }>): TrafficSourceRow[] =>
          items.map((item) => ({ day: String(item?.day ?? ''), traffic_source: String(item?.traffic_source ?? ''), views: Number(item?.views ?? 0), watch_time_minutes: Number(item?.watch_time_minutes ?? 0) }))
        let currentUrl: string, previousUrl: string
        if (contentSelection === 'all') {
          currentUrl = `http://localhost:8000/analytics/traffic-sources?start_date=${range.start}&end_date=${range.end}`
          previousUrl = `http://localhost:8000/analytics/traffic-sources?start_date=${previousRange.start}&end_date=${previousRange.end}`
        } else {
          currentUrl = `http://localhost:8000/analytics/video-traffic-sources?start_date=${range.start}&end_date=${range.end}&content_type=${contentSelection}`
          previousUrl = `http://localhost:8000/analytics/video-traffic-sources?start_date=${previousRange.start}&end_date=${previousRange.end}&content_type=${contentSelection}`
        }
        const [currentRes, previousRes] = await Promise.all([fetch(currentUrl), fetch(previousUrl)])
        const [currentPayload, previousPayload] = await Promise.all([currentRes.json(), previousRes.json()])
        setTrafficRows(Array.isArray(currentPayload?.items) ? toRows(currentPayload.items) : [])
        setPreviousTrafficRows(Array.isArray(previousPayload?.items) ? toRows(previousPayload.items) : [])
      } catch {
        setTrafficRows([])
        setPreviousTrafficRows([])
      }
    }
    loadTraffic()
  }, [rangeValue, contentSelection, range.start, range.end, previousRange.start, previousRange.end])

  useEffect(() => {
    if (!rangeValue) return
    const { start, end } = rangeValue.range
    async function loadTopContent() {
      try {
        const contentParam = contentSelection === 'all' ? '' : `&content_type=${contentSelection}`
        const response = await fetch(`http://localhost:8000/analytics/top-content?start_date=${start}&end_date=${end}&limit=10${contentParam}`)
        const data = await response.json()
        const items = Array.isArray(data.items) ? data.items : []
        const transformed = items.map((item: Record<string, unknown>, index: number) => ({
          video_id: item.video_id || '',
          rank: index + 1,
          title: item.title || '(untitled)',
          published_at: item.published_at || '',
          upload_date: formatDisplayDate(item.published_at as string),
          thumbnail_url: item.thumbnail_url || '',
          avg_view_duration: formatDuration(item.avg_view_duration_seconds as number),
          avg_view_pct: formatWholeNumber(item.avg_view_pct as number ?? 0),
          views: formatWholeNumber(item.views as number ?? 0),
        }))
        setTopContent(transformed)
      } catch {
        setTopContent([])
      }
    }
    loadTopContent()
  }, [rangeValue, contentSelection])

  useEffect(() => {
    const today = new Date()
    const end = today.toISOString().slice(0, 10)
    const start = new Date(today)
    start.setDate(start.getDate() - 89)
    const startDate = start.toISOString().slice(0, 10)
    const mapItems = (payload: { items?: Record<string, unknown>[] }): VideoDetailListItem[] =>
      (Array.isArray(payload?.items) ? payload.items : []).map((item) => ({
        video_id: String(item.video_id ?? ''),
        title: String(item.title ?? '(untitled)'),
        thumbnail_url: String(item.thumbnail_url ?? ''),
        published_at: String(item.published_at ?? ''),
        views: Number(item.views ?? 0),
        watch_time_minutes: Number(item.watch_time_minutes ?? 0),
        avg_view_duration_seconds: Number(item.avg_view_duration_seconds ?? 0),
        avg_view_pct: Number(item.avg_view_pct ?? 0),
      }))
    async function loadLatestContent() {
      try {
        const requests: Promise<Response>[] = []
        if (contentSelection === 'all' || contentSelection === 'video') {
          requests.push(fetch(`http://localhost:8000/analytics/top-content?start_date=${startDate}&end_date=${end}&limit=10&content_type=video&sort_by=views&direction=desc`))
        } else {
          requests.push(Promise.resolve(new Response(JSON.stringify({ items: [] }))))
        }
        if (contentSelection === 'all' || contentSelection === 'short') {
          requests.push(fetch(`http://localhost:8000/analytics/top-content?start_date=${startDate}&end_date=${end}&limit=10&content_type=short&sort_by=views&direction=desc`))
        } else {
          requests.push(Promise.resolve(new Response(JSON.stringify({ items: [] }))))
        }
        const [longformRes, shortRes] = await Promise.all(requests)
        const [longformData, shortData] = await Promise.all([longformRes.json(), shortRes.json()])
        setLatestLongform(mapItems(longformData))
        setLatestShorts(mapItems(shortData))
      } catch {
        setLatestLongform([])
        setLatestShorts([])
      }
    }
    loadLatestContent()
  }, [contentSelection])

  useEffect(() => { setStored('analyticsContentSelection', contentSelection) }, [contentSelection])
  useEffect(() => { setStored('analyticsTab', analyticsTab) }, [analyticsTab])

  return (
    <section className="page">
      <header className="page-header header-row">
        <div className="header-text">
          <h1>Analytics</h1>
        </div>
        <div className="analytics-range-controls">
          <DataRangeControl
            storageKey="analyticsRange"
            years={years}
            defaultPreset="range:28d"
            presetPlaceholder="Last 28 days"
            secondaryControl={{
              value: contentSelection,
              onChange: setContentSelection,
              placeholder: 'All videos',
              items: CONTENT_OPTIONS,
            }}
            onChange={setRangeValue}
          />
        </div>
      </header>
      <div className="analytics-tab-row">
        <button type="button" className={analyticsTab === 'metrics' ? 'analytics-tab active' : 'analytics-tab'} onClick={() => setAnalyticsTab('metrics')}>Metrics</button>
        <button type="button" className={analyticsTab === 'engagement' ? 'analytics-tab active' : 'analytics-tab'} onClick={() => setAnalyticsTab('engagement')}>Engagement</button>
        <button type="button" className={analyticsTab === 'monetization' ? 'analytics-tab active' : 'analytics-tab'} onClick={() => setAnalyticsTab('monetization')}>Monetization</button>
        <button type="button" className={analyticsTab === 'discovery' ? 'analytics-tab active' : 'analytics-tab'} onClick={() => setAnalyticsTab('discovery')}>Discovery</button>
        <button type="button" className={analyticsTab === 'insights' ? 'analytics-tab active' : 'analytics-tab'} onClick={() => setAnalyticsTab('insights')}>Insights</button>
      </div>
      <div className="page-body">
        {rangeValue && analyticsTab === 'metrics' && (
          <MetricsTab
            range={rangeValue.range}
            previousRange={rangeValue.previousRange}
            granularity={rangeValue.granularity}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
            dataSources={tabDataSources}
            selectedSourceIndex={selectedSourceIndex}
            topContent={topContent}
            latestLongform={latestLongform}
            latestShorts={latestShorts}
          />
        )}
        {rangeValue && analyticsTab === 'engagement' && (
          <EngagementTab
            range={rangeValue.range}
            previousRange={rangeValue.previousRange}
            granularity={rangeValue.granularity}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
            dataSources={tabDataSources}
            selectedSourceIndex={selectedSourceIndex}
          />
        )}
        {rangeValue && analyticsTab === 'monetization' && (
          <MonetizationTab
            range={rangeValue.range}
            previousRange={rangeValue.previousRange}
            granularity={rangeValue.granularity}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
            dataSources={tabDataSources}
            selectedSourceIndex={selectedSourceIndex}
          />
        )}
        {rangeValue && analyticsTab === 'discovery' && (
          <DiscoveryTab
            range={rangeValue.range}
            previousRange={rangeValue.previousRange}
            granularity={rangeValue.granularity}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
            dataSources={discoveryDataSources}
            selectedSourceIndex={selectedSourceIndex}
          />
        )}
        {rangeValue && analyticsTab === 'insights' && (
          <InsightsTab
            range={rangeValue.range}
            filterParam={contentSelection === 'all' ? {} : { content_type: contentSelection }}
          />
        )}
      </div>
    </section>
  )
}

export default Analytics

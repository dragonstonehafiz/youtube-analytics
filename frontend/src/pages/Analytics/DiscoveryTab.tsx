import { useState, useEffect, useMemo } from 'react'
import { MetricChartCard, type MetricItem, type Granularity, type PublishedItem } from '../../components/charts'
import {
  PageCard,
  SearchInsightsTopTermsCard,
  TrafficSourceShareCard,
  TrafficSourceTopVideosCard,
  type SearchInsightsTopTerm,
  type TopTrafficVideo,
  type TrafficSourceShareItem,
  type TrafficSourceOption,
} from '../../components/cards'
import { buildTrafficSeries, type TrafficSourceRow } from '../../utils/trafficSeries'
import { formatWholeNumber } from '../../utils/number'

type TopVideosBySourceResponseItem = {
  video_id: string
  title: string
  thumbnail_url: string
  published_at: string
  views: number
  watch_time_minutes: number
}

type TrafficSourceResponseItem = {
  day?: string
  traffic_source?: string
  views?: number
  watch_time_minutes?: number
}

type TopSearchResponseItem = {
  search_term: string
  views: number
  watch_time_minutes: number
  video_count: number
}

type Props = {
  range: { start: string; end: string }
  previousRange: { start: string; end: string; daySpan: number }
  granularity: Granularity
  contentType: string
  onOpenVideo: (videoId: string) => void
  publishedDates: Record<string, PublishedItem[]>
}

export default function DiscoveryTab({ range, previousRange, granularity, contentType, onOpenVideo, publishedDates }: Props) {
  const [discoveryTrafficRows, setDiscoveryTrafficRows] = useState<TrafficSourceRow[]>([])
  const [discoveryPreviousTrafficRows, setDiscoveryPreviousTrafficRows] = useState<TrafficSourceRow[]>([])
  const [trafficTopSource, setTrafficTopSource] = useState('')
  const [trafficTopVideos, setTrafficTopVideos] = useState<TopTrafficVideo[]>([])
  const [trafficTopLoading, setTrafficTopLoading] = useState(false)
  const [trafficTopError, setTrafficTopError] = useState<string | null>(null)
  const [searchTopTerms, setSearchTopTerms] = useState<SearchInsightsTopTerm[]>([])
  const [searchTopTermsLoading, setSearchTopTermsLoading] = useState(false)
  const [searchTopTermsError, setSearchTopTermsError] = useState<string | null>(null)

  useEffect(() => {
    async function loadDiscoveryData() {
      try {
        const currentUrl =
          contentType === 'all'
            ? `http://localhost:8000/analytics/traffic-sources?start_date=${range.start}&end_date=${range.end}`
            : `http://localhost:8000/analytics/video-traffic-sources?start_date=${range.start}&end_date=${range.end}&content_type=${contentType}`
        const previousUrl =
          contentType === 'all'
            ? `http://localhost:8000/analytics/traffic-sources?start_date=${previousRange.start}&end_date=${previousRange.end}`
            : `http://localhost:8000/analytics/video-traffic-sources?start_date=${previousRange.start}&end_date=${previousRange.end}&content_type=${contentType}`
        const [currentRes, previousRes] = await Promise.all([fetch(currentUrl), fetch(previousUrl)])
        const [currentPayload, previousPayload] = await Promise.all([currentRes.json(), previousRes.json()])
        const toRows = (items: TrafficSourceResponseItem[]): TrafficSourceRow[] =>
          items.map((item) => ({
            day: String(item?.day ?? ''),
            traffic_source: String(item?.traffic_source ?? ''),
            views: Number(item?.views ?? 0),
            watch_time_minutes: Number(item?.watch_time_minutes ?? 0),
          }))
        setDiscoveryTrafficRows(Array.isArray(currentPayload?.items) ? toRows(currentPayload.items) : [])
        setDiscoveryPreviousTrafficRows(Array.isArray(previousPayload?.items) ? toRows(previousPayload.items) : [])
      } catch {
        setDiscoveryTrafficRows([])
        setDiscoveryPreviousTrafficRows([])
      }
    }
    loadDiscoveryData()
  }, [range.start, range.end, previousRange.start, previousRange.end, contentType])

  useEffect(() => {
    async function loadTopVideosBySource() {
      if (!trafficTopSource) {
        setTrafficTopVideos([])
        setTrafficTopError(null)
        return
      }
      setTrafficTopLoading(true)
      setTrafficTopError(null)
      try {
        const params = new URLSearchParams({
          start_date: range.start,
          end_date: range.end,
          traffic_source: trafficTopSource,
          limit: '10',
        })
        if (contentType !== 'all') params.set('content_type', contentType)
        const response = await fetch(`http://localhost:8000/analytics/video-traffic-source-top-videos?${params.toString()}`)
        if (!response.ok) throw new Error(`Failed to load top traffic-source videos (${response.status})`)
        const payload = await response.json()
        const items = (Array.isArray(payload?.items) ? payload.items : []) as TopVideosBySourceResponseItem[]
        setTrafficTopVideos(
          items.map((item) => ({
            video_id: String(item.video_id ?? ''),
            title: String(item.title ?? '(untitled)'),
            thumbnail_url: String(item.thumbnail_url ?? ''),
            views: Number(item.views ?? 0),
            watch_time_minutes: Number(item.watch_time_minutes ?? 0),
          }))
        )
      } catch (error) {
        setTrafficTopVideos([])
        setTrafficTopError(error instanceof Error ? error.message : 'Failed to load top traffic-source videos.')
      } finally {
        setTrafficTopLoading(false)
      }
    }
    loadTopVideosBySource()
  }, [range.start, range.end, contentType, trafficTopSource])

  useEffect(() => {
    async function loadTopSearchTerms() {
      setSearchTopTermsLoading(true)
      setSearchTopTermsError(null)
      try {
        const params = new URLSearchParams({ start_date: range.start, end_date: range.end })
        if (contentType !== 'all') params.set('content_type', contentType)
        const response = await fetch(`http://localhost:8000/analytics/video-search-insights?${params.toString()}`)
        if (!response.ok) throw new Error(`Failed to load top search terms (${response.status})`)
        const payload = await response.json()
        const items = (Array.isArray(payload?.items) ? payload.items : []) as TopSearchResponseItem[]
        setSearchTopTerms(
          items.map((item) => ({
            search_term: String(item.search_term ?? ''),
            views: Number(item.views ?? 0),
            watch_time_minutes: Number(item.watch_time_minutes ?? 0),
            video_count: Number(item.video_count ?? 0),
          }))
        )
      } catch (error) {
        setSearchTopTerms([])
        setSearchTopTermsError(error instanceof Error ? error.message : 'Failed to load top search terms.')
      } finally {
        setSearchTopTermsLoading(false)
      }
    }
    loadTopSearchTerms()
  }, [range.start, range.end, contentType])

  const discoveryMetricsData = useMemo<MetricItem[]>(() => {
    const viewsSeries = buildTrafficSeries(discoveryTrafficRows, 'views', range.start, range.end)
    const watchTimeSeries = buildTrafficSeries(discoveryTrafficRows, 'watch_time', range.start, range.end)
    const previousViewsSeries = buildTrafficSeries(discoveryPreviousTrafficRows, 'views', previousRange.start, previousRange.end)
    const previousWatchTimeSeries = buildTrafficSeries(discoveryPreviousTrafficRows, 'watch_time', previousRange.start, previousRange.end)

    const totalViews = viewsSeries.reduce((sum, line) => sum + line.points.reduce((acc, point) => acc + point.value, 0), 0)
    const totalWatch = watchTimeSeries.reduce((sum, line) => sum + line.points.reduce((acc, point) => acc + point.value, 0), 0)

    return [
      {
        key: 'views',
        label: 'Views',
        value: formatWholeNumber(Math.round(totalViews)),
        series: viewsSeries,
        previousSeries: previousViewsSeries,
      },
      {
        key: 'watch_time',
        label: 'Watch time',
        value: formatWholeNumber(Math.round(totalWatch)),
        series: watchTimeSeries,
        previousSeries: previousWatchTimeSeries,
      },
    ]
  }, [discoveryTrafficRows, discoveryPreviousTrafficRows, range.start, range.end, previousRange.start, previousRange.end])

  const trafficShareItems = useMemo<TrafficSourceShareItem[]>(() => {
    const totals = new Map<string, number>()
    discoveryTrafficRows.forEach((row) => {
      if (!row.traffic_source) return
      totals.set(row.traffic_source, (totals.get(row.traffic_source) ?? 0) + (row.views ?? 0))
    })
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([source, views]) => ({ key: source, label: source.replace(/_/g, ' '), views }))
  }, [discoveryTrafficRows])

  const trafficSourceOptions = useMemo<TrafficSourceOption[]>(
    () => trafficShareItems.map((item) => ({ label: item.label, value: item.key })),
    [trafficShareItems]
  )

  // Auto-select first traffic source when options load or change
  useEffect(() => {
    if (!trafficTopSource && trafficSourceOptions.length > 0) {
      setTrafficTopSource(trafficSourceOptions[0].value)
      return
    }
    if (trafficTopSource && !trafficSourceOptions.some((option) => option.value === trafficTopSource)) {
      setTrafficTopSource(trafficSourceOptions[0]?.value ?? '')
    }
  }, [trafficTopSource, trafficSourceOptions])


  return (
    <div className="analytics-monetization-layout">
      <PageCard>
        <MetricChartCard
          data={discoveryMetricsData}
          granularity={granularity}
          publishedDates={publishedDates}
        />
      </PageCard>
      <div className="analytics-traffic-row">
        <div className="analytics-discovery-stack">
          <PageCard>
            <TrafficSourceShareCard items={trafficShareItems} />
          </PageCard>
          <PageCard>
            <SearchInsightsTopTermsCard
              items={searchTopTerms}
              loading={searchTopTermsLoading}
              error={searchTopTermsError}
              startDate={range.start}
              endDate={range.end}
              contentType={contentType === 'all' ? null : contentType}
            />
          </PageCard>
        </div>
        <PageCard>
          <TrafficSourceTopVideosCard
            source={trafficTopSource}
            sourceOptions={trafficSourceOptions}
            items={trafficTopVideos}
            loading={trafficTopLoading}
            error={trafficTopError}
            onSourceChange={setTrafficTopSource}
            onOpenVideo={onOpenVideo}
          />
        </PageCard>
      </div>
    </div>
  )
}

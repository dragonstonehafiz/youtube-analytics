import { useState, useEffect, useMemo } from 'react'
import { MetricChartCard, type MetricItem, type Granularity } from '../components/charts'
import {
  PageCard,
  SearchInsightsTopTermsCard,
  TrafficSourceShareCard,
  TrafficSourceTopVideosCard,
  type SearchInsightsTopTerm,
  type TopTrafficVideo,
  type TrafficSourceShareItem,
  type TrafficSourceOption,
} from '../components/cards'
import { buildTrafficSeries } from '../utils/trafficSeries'
import { formatWholeNumber } from '../utils/number'
import type { DiscoveryDataSource } from '../types'

type TopVideosBySourceResponseItem = { video_id: string; title: string; thumbnail_url: string; published_at: string; views: number; watch_time_minutes: number }
type TopSearchResponseItem = { search_term: string; views: number; watch_time_minutes: number; video_count: number }

type Props = {
  range: { start: string; end: string }
  previousRange: { start: string; end: string; daySpan?: number }
  granularity: Granularity
  onOpenVideo: (videoId: string) => void
  dataSources: DiscoveryDataSource[]
  selectedSourceIndex: number
}

export default function DiscoveryTab({ range, previousRange, granularity, onOpenVideo, dataSources, selectedSourceIndex }: Props) {
  const selected = dataSources[selectedSourceIndex]
  const trafficRows = selected?.trafficRows ?? []
  const previousTrafficRows = selected?.previousTrafficRows ?? []
  const videoIds = selected?.videoIds ?? []
  const contentType = selected?.contentType
  const publishedDates = selected?.publishedDates ?? {}
  const videoIdsKey = videoIds.join(',')

  const [trafficTopSource, setTrafficTopSource] = useState('')
  const [trafficTopVideos, setTrafficTopVideos] = useState<TopTrafficVideo[]>([])
  const [trafficTopLoading, setTrafficTopLoading] = useState(false)
  const [trafficTopError, setTrafficTopError] = useState<string | null>(null)
  const [searchTopTerms, setSearchTopTerms] = useState<SearchInsightsTopTerm[]>([])
  const [searchTopTermsLoading, setSearchTopTermsLoading] = useState(false)
  const [searchTopTermsError, setSearchTopTermsError] = useState<string | null>(null)

  useEffect(() => {
    async function loadTopVideosBySource() {
      if (!trafficTopSource) { setTrafficTopVideos([]); setTrafficTopError(null); return }
      if (videoIds.length === 0 && !contentType) { setTrafficTopVideos([]); return }
      setTrafficTopLoading(true)
      setTrafficTopError(null)
      try {
        const params = new URLSearchParams({ start_date: range.start, end_date: range.end, traffic_source: trafficTopSource, limit: '10' })
        if (contentType && contentType !== 'all') params.set('content_type', contentType)
        if (videoIds.length > 0) params.set('video_ids', videoIds.join(','))
        const url = `http://localhost:8000/discovery/video/traffic-sources/top-videos?${params.toString()}`
        const response = await fetch(url)
        if (!response.ok) throw new Error(`Failed to load traffic-source videos (${response.status})`)
        const payload = await response.json()
        const items = (Array.isArray(payload?.items) ? payload.items : []) as TopVideosBySourceResponseItem[]
        setTrafficTopVideos(items.map((item) => ({ video_id: String(item.video_id ?? ''), title: String(item.title ?? '(untitled)'), thumbnail_url: String(item.thumbnail_url ?? ''), views: Number(item.views ?? 0), watch_time_minutes: Number(item.watch_time_minutes ?? 0) })))
      } catch (error) {
        setTrafficTopVideos([])
        setTrafficTopError(error instanceof Error ? error.message : 'Failed to load top traffic-source videos.')
      } finally {
        setTrafficTopLoading(false)
      }
    }
    loadTopVideosBySource()
  }, [range.start, range.end, contentType, videoIds, trafficTopSource])

  useEffect(() => {
    async function loadTopSearchTerms() {
      if (videoIdsKey.length === 0 && !contentType) { setSearchTopTerms([]); setSearchTopTermsLoading(false); return }
      setSearchTopTermsLoading(true)
      setSearchTopTermsError(null)
      try {
        const params = new URLSearchParams({ start_date: range.start, end_date: range.end })
        if (contentType && contentType !== 'all') params.set('content_type', contentType)
        if (videoIdsKey.length > 0) params.set('video_ids', videoIdsKey)
        const response = await fetch(`http://localhost:8000/discovery/video/search-insights?${params.toString()}`)
        if (!response.ok) throw new Error(`Failed to load top search terms (${response.status})`)
        const payload = await response.json()
        const termItems = (Array.isArray(payload?.items) ? payload.items : []) as TopSearchResponseItem[]
        setSearchTopTerms(termItems.map((item) => ({ search_term: String(item.search_term ?? ''), views: Number(item.views ?? 0), watch_time_minutes: Number(item.watch_time_minutes ?? 0), video_count: Number(item.video_count ?? 0) })))
      } catch (error) {
        setSearchTopTerms([])
        setSearchTopTermsError(error instanceof Error ? error.message : 'Failed to load top search terms.')
      } finally {
        setSearchTopTermsLoading(false)
      }
    }
    loadTopSearchTerms()
  }, [range.start, range.end, contentType, videoIdsKey])

  const discoveryMetricsData = useMemo<MetricItem[]>(() => {
    const viewsSeries = buildTrafficSeries(trafficRows, 'views', range.start, range.end)
    const watchTimeSeries = buildTrafficSeries(trafficRows, 'watch_time', range.start, range.end)
    const previousViewsSeries = buildTrafficSeries(previousTrafficRows, 'views', previousRange.start, previousRange.end)
    const previousWatchTimeSeries = buildTrafficSeries(previousTrafficRows, 'watch_time', previousRange.start, previousRange.end)
    const totalViews = viewsSeries.reduce((sum, line) => sum + line.points.reduce((acc, point) => acc + point.value, 0), 0)
    const totalWatch = watchTimeSeries.reduce((sum, line) => sum + line.points.reduce((acc, point) => acc + point.value, 0), 0)
    return [
      { key: 'views', label: 'Views', value: formatWholeNumber(Math.round(totalViews)), series: viewsSeries, previousSeries: previousViewsSeries },
      { key: 'watch_time', label: 'Watch time', value: formatWholeNumber(Math.round(totalWatch)), series: watchTimeSeries, previousSeries: previousWatchTimeSeries },
    ]
  }, [trafficRows, previousTrafficRows, range.start, range.end, previousRange.start, previousRange.end])

  const trafficShareItems = useMemo<TrafficSourceShareItem[]>(() => {
    const totals = new Map<string, number>()
    trafficRows.forEach((row) => {
      if (!row.traffic_source) return
      totals.set(row.traffic_source, (totals.get(row.traffic_source) ?? 0) + (row.views ?? 0))
    })
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([source, views]) => ({ key: source, label: source.replace(/_/g, ' '), views }))
  }, [trafficRows])

  const trafficSourceOptions = useMemo<TrafficSourceOption[]>(
    () => trafficShareItems.map((item) => ({ label: item.label, value: item.key })),
    [trafficShareItems]
  )

  useEffect(() => {
    if (!trafficTopSource && trafficSourceOptions.length > 0) { setTrafficTopSource(trafficSourceOptions[0].value); return }
    if (trafficTopSource && !trafficSourceOptions.some((option) => option.value === trafficTopSource)) {
      setTrafficTopSource(trafficSourceOptions[0]?.value ?? '')
    }
  }, [trafficTopSource, trafficSourceOptions])

  return (
    <div className="analytics-monetization-layout">
      <PageCard>
        <MetricChartCard data={discoveryMetricsData} granularity={granularity} publishedDates={publishedDates} />
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
              contentType={contentType !== 'all' ? (contentType ?? null) : null}
              videoIds={videoIds.length > 0 ? videoIds : undefined}
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

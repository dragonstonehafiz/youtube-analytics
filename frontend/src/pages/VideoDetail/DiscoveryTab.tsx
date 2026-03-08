import { useEffect, useMemo, useState } from 'react'
import { MetricChartCard, type MetricItem, type Granularity, type SeriesPoint } from '../../components/charts'
import {
  PageCard,
  SearchInsightsTopTermsCard,
  TrafficSourceShareCard,
  type SearchInsightsTopTerm,
  type TrafficSourceShareItem,
} from '../../components/cards'
import { buildTrafficSeries, type TrafficSourceRow } from '../../utils/trafficSeries'
import { formatWholeNumber } from '../../utils/number'

type DiscoveryMultiSeries = { key: string; label: string; color: string; points: SeriesPoint[] }
type DateRange = { start: string; end: string }

type TopSearchResponseItem = {
  search_term: string
  views: number
  watch_time_minutes: number
  video_count: number
}

type Props = {
  videoId: string | undefined
  range: DateRange
  previousRange: DateRange
  granularity: Granularity
}

export default function DiscoveryTab({ videoId, range, previousRange, granularity }: Props) {
  const [trafficRows, setTrafficRows] = useState<TrafficSourceRow[]>([])
  const [previousTrafficRows, setPreviousTrafficRows] = useState<TrafficSourceRow[]>([])
  const [trafficLoading, setTrafficLoading] = useState(false)
  const [trafficError, setTrafficError] = useState<string | null>(null)
  const [searchTopTerms, setSearchTopTerms] = useState<SearchInsightsTopTerm[]>([])
  const [searchTopTermsLoading, setSearchTopTermsLoading] = useState(false)
  const [searchTopTermsError, setSearchTopTermsError] = useState<string | null>(null)

  useEffect(() => {
    async function loadDiscoveryTraffic() {
      if (!videoId) {
        setTrafficRows([])
        setPreviousTrafficRows([])
        return
      }
      setTrafficLoading(true)
      setTrafficError(null)
      try {
        const [currentResponse, previousResponse] = await Promise.all([
          fetch(`http://localhost:8000/analytics/video-traffic-sources?start_date=${range.start}&end_date=${range.end}&video_id=${videoId}`),
          fetch(`http://localhost:8000/analytics/video-traffic-sources?start_date=${previousRange.start}&end_date=${previousRange.end}&video_id=${videoId}`),
        ])
        const [currentData, previousData] = await Promise.all([currentResponse.json(), previousResponse.json()])
        const toRows = (items: TrafficSourceRow[]): TrafficSourceRow[] =>
          items.map((item) => ({
            day: String(item?.day ?? ''),
            traffic_source: String(item?.traffic_source ?? ''),
            views: Number(item?.views ?? 0),
            watch_time_minutes: Number(item?.watch_time_minutes ?? 0),
          }))
        setTrafficRows(Array.isArray(currentData?.items) ? toRows(currentData.items) : [])
        setPreviousTrafficRows(Array.isArray(previousData?.items) ? toRows(previousData.items) : [])
      } catch {
        setTrafficRows([])
        setPreviousTrafficRows([])
        setTrafficError('Failed to load traffic sources.')
      } finally {
        setTrafficLoading(false)
      }
    }

    loadDiscoveryTraffic()
  }, [videoId, range.start, range.end, previousRange.start, previousRange.end])

  useEffect(() => {
    async function loadTopSearchTerms() {
      if (!videoId) return
      setSearchTopTermsLoading(true)
      setSearchTopTermsError(null)
      try {
        const params = new URLSearchParams({ start_date: range.start, end_date: range.end, video_ids: videoId })
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
      } catch (err) {
        setSearchTopTerms([])
        setSearchTopTermsError(err instanceof Error ? err.message : 'Failed to load top search terms.')
      } finally {
        setSearchTopTermsLoading(false)
      }
    }

    loadTopSearchTerms()
  }, [videoId, range.start, range.end])

  const metricsData = useMemo<MetricItem[]>(() => {
    const viewsSeries = buildTrafficSeries(trafficRows, 'views', range.start, range.end)
    const watchTimeSeries = buildTrafficSeries(trafficRows, 'watch_time', range.start, range.end)
    const previousViewsSeries = buildTrafficSeries(previousTrafficRows, 'views', previousRange.start, previousRange.end)
    const previousWatchTimeSeries = buildTrafficSeries(previousTrafficRows, 'watch_time', previousRange.start, previousRange.end)

    const totalViews = viewsSeries.reduce((sum, line) => sum + line.points.reduce((acc, pt) => acc + pt.value, 0), 0)
    const totalWatch = watchTimeSeries.reduce((sum, line) => sum + line.points.reduce((acc, pt) => acc + pt.value, 0), 0)

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
  }, [trafficRows, previousTrafficRows, range.start, range.end, previousRange.start, previousRange.end])

  const shareItems = useMemo<TrafficSourceShareItem[]>(() => {
    const totals = new Map<string, number>()
    trafficRows.forEach((row) => {
      if (!row.traffic_source) return
      totals.set(row.traffic_source, (totals.get(row.traffic_source) ?? 0) + row.views)
    })
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([source, views]) => ({ key: source, label: source.replace(/_/g, ' '), views }))
  }, [trafficRows])


  return (
    <>
      <div className="page-row">
        <PageCard>
          {trafficLoading ? (
            <div className="video-detail-state">Loading video analytics...</div>
          ) : trafficError ? (
            <div className="video-detail-state">{trafficError}</div>
          ) : (
            <MetricChartCard
              data={metricsData}
              granularity={granularity}
              publishedDates={{}}
            />
          )}
        </PageCard>
      </div>
      {!trafficLoading && !trafficError && (
        <div className="page-row">
          <div className="video-detail-discovery-row">
            <PageCard>
              <TrafficSourceShareCard items={shareItems} />
            </PageCard>
            <PageCard>
              <SearchInsightsTopTermsCard
                items={searchTopTerms}
                loading={searchTopTermsLoading}
                error={searchTopTermsError}
                startDate={range.start}
                endDate={range.end}
                videoIds={videoId ? [videoId] : []}
              />
            </PageCard>
          </div>
        </div>
      )}
    </>
  )
}

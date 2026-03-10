import { useState, useEffect, useMemo, useRef } from 'react'
import { MetricChartCard, type Granularity, type SeriesPoint, type MetricItem, type PublishedItem } from '../../components/charts'
import { PageCard, VideoDetailListCard } from '../../components/cards'
import { TopContentTable } from '../../components/tables'
import { formatDisplayDate } from '../../utils/date'
import { formatCurrency, formatWholeNumber } from '../../utils/number'
import UploadPublishTooltip, { type UploadHoverState } from '../../components/charts/UploadPublishTooltip'
import { useSpikes } from '../../hooks/useSpikes'

type TotalsState = {
  views: number
  watch_time_minutes: number
  avg_view_duration_seconds: number
  estimated_revenue: number
  subscribers_net?: number
}

type LatestContentItem = {
  video_id: string
  title: string
  thumbnail_url: string
  published_at: string
  views: number
  watch_time_minutes: number
  avg_view_duration_seconds: number
  avg_view_pct: number
}

type TopContentRow = {
  video_id: string
  rank: number
  title: string
  published_at: string
  upload_date: string
  thumbnail_url: string
  avg_view_duration: string
  avg_view_pct: string
  views: string
}

type Props = {
  range: { start: string; end: string }
  previousRange: { start: string; end: string; daySpan: number }
  granularity: Granularity
  contentType: string
  onOpenVideo: (videoId: string) => void
  publishedDates: Record<string, PublishedItem[]>
}

function buildDays(items: any[]): [string[], Map<string, any>] {
  const byDay = new Map<string, any>()
  items.forEach((item: any) => {
    if (typeof item?.day === 'string') byDay.set(item.day, item)
  })
  const unique = Array.from(
    new Set<string>(
      items.map((i: any) => i.day).filter((d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
    )
  ).sort((a, b) => a.localeCompare(b))
  if (unique.length === 0) return [[], byDay]
  const days: string[] = []
  const cursor = new Date(`${unique[0]}T00:00:00Z`)
  const end = new Date(`${unique[unique.length - 1]}T00:00:00Z`)
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return [days, byDay]
}

export default function MetricsTab({ range, previousRange, granularity, contentType, onOpenVideo, publishedDates }: Props) {
  const [series, setSeries] = useState<Record<string, SeriesPoint[]>>({ views: [], watch_time: [], subscribers: [], revenue: [] })
  const [previousSeries, setPreviousSeries] = useState<Record<string, SeriesPoint[]>>({ views: [], watch_time: [], subscribers: [], revenue: [] })
  const [totals, setTotals] = useState<TotalsState>({ views: 0, watch_time_minutes: 0, avg_view_duration_seconds: 0, estimated_revenue: 0 })
  const [topContent, setTopContent] = useState<TopContentRow[]>([])
  const [latestLongform, setLatestLongform] = useState<LatestContentItem[]>([])
  const [latestShorts, setLatestShorts] = useState<LatestContentItem[]>([])
  const [hoverSpike, setHoverSpike] = useState<UploadHoverState | null>(null)
  const spikeTimeoutRef = useRef<number | null>(null)
  const spikeHoverLockedRef = useRef(false)
  const hoverHandlers = useMemo(() => ({ setHoverSpike, spikeTimeoutRef, spikeHoverLockedRef }), [])
  const emptyVideoIds = useMemo(() => [], [])

  const viewsSpikes = useSpikes(range.start, range.end, 'views', granularity, hoverHandlers, emptyVideoIds)
  const watchTimeSpikes = useSpikes(range.start, range.end, 'watch_time_minutes', granularity, hoverHandlers, emptyVideoIds)
  const subscribersSpikes = useSpikes(range.start, range.end, 'subscribers_gained', granularity, hoverHandlers, emptyVideoIds)
  const revenueSpikes = useSpikes(range.start, range.end, 'estimated_revenue', granularity, hoverHandlers, emptyVideoIds)

  useEffect(() => {
    async function loadSummary() {
      try {
        const buildUrl = (start: string, end: string) =>
          contentType === 'all'
            ? `http://localhost:8000/analytics/channel-daily?start_date=${start}&end_date=${end}`
            : `http://localhost:8000/analytics/daily/summary?start_date=${start}&end_date=${end}&content_type=${contentType}`
        const [currentRes, previousRes] = await Promise.all([
          fetch(buildUrl(range.start, range.end)),
          fetch(buildUrl(previousRange.start, previousRange.end)),
        ])
        const [data, previousData] = await Promise.all([currentRes.json(), previousRes.json()])
        const items = Array.isArray(data.items) ? data.items : []
        const avgDuration =
          items.length > 0
            ? items.reduce((sum: number, item: any) => sum + (item.average_view_duration_seconds ?? 0), 0) / items.length
            : 0
        const subscribersNet = items.length > 0
          ? items.reduce((sum: number, item: any) => sum + ((item.subscribers_gained ?? 0) - (item.subscribers_lost ?? 0)), 0)
          : 0
        setTotals({
          views: data.totals?.views ?? 0,
          watch_time_minutes: data.totals?.watch_time_minutes ?? 0,
          avg_view_duration_seconds: avgDuration,
          estimated_revenue: data.totals?.estimated_revenue ?? 0,
          subscribers_net: subscribersNet,
        })
        const previousItems = Array.isArray(previousData.items) ? previousData.items : []
        const [days, byDay] = buildDays(items)
        if (days.length === 0) {
          setSeries({ views: [], watch_time: [], subscribers: [], revenue: [] })
          setPreviousSeries({ views: [], watch_time: [], subscribers: [], revenue: [] })
          return
        }
        setSeries({
          views: days.map((day) => ({ date: day, value: byDay.get(day)?.views ?? 0 })),
          watch_time: days.map((day) => ({ date: day, value: Math.round((byDay.get(day)?.watch_time_minutes ?? 0) / 60) })),
          subscribers: days.map((day) => ({ date: day, value: (byDay.get(day)?.subscribers_gained ?? 0) - (byDay.get(day)?.subscribers_lost ?? 0) })),
          revenue: days.map((day) => ({ date: day, value: byDay.get(day)?.estimated_revenue ?? 0 })),
        })
        const [prevDays, prevByDay] = buildDays(previousItems)
        setPreviousSeries({
          views: prevDays.map((day) => ({ date: day, value: prevByDay.get(day)?.views ?? 0 })),
          watch_time: prevDays.map((day) => ({ date: day, value: Math.round((prevByDay.get(day)?.watch_time_minutes ?? 0) / 60) })),
          subscribers: prevDays.map((day) => ({ date: day, value: (prevByDay.get(day)?.subscribers_gained ?? 0) - (prevByDay.get(day)?.subscribers_lost ?? 0) })),
          revenue: prevDays.map((day) => ({ date: day, value: prevByDay.get(day)?.estimated_revenue ?? 0 })),
        })
      } catch (error) {
        console.error('Failed to load analytics summary', error)
      }
    }
    loadSummary()
  }, [range.start, range.end, contentType, previousRange.start, previousRange.end, previousRange.daySpan])


  useEffect(() => {
    async function loadTopContent() {
      try {
        const contentParam = contentType === 'all' ? '' : `&content_type=${contentType}`
        const response = await fetch(
          `http://localhost:8000/analytics/top-content?start_date=${range.start}&end_date=${range.end}&limit=10${contentParam}`
        )
        const data = await response.json()
        const items = Array.isArray(data.items) ? data.items : []
        const formatDuration = (seconds: number) => {
          const mins = Math.floor(seconds / 60)
          const secs = Math.floor(seconds % 60)
          return `${mins}:${secs.toString().padStart(2, '0')}`
        }
        setTopContent(
          items.map((item: any, index: number) => ({
            video_id: String(item.video_id ?? ''),
            rank: index + 1,
            title: item.title,
            published_at: item.published_at ?? '',
            upload_date: formatDisplayDate(item.published_at),
            thumbnail_url: item.thumbnail_url ?? '',
            avg_view_duration: formatDuration(item.avg_view_duration_seconds ?? 0),
            avg_view_pct: `${(item.avg_view_pct ?? 0).toFixed(1)}%`,
            views: Number(item.views ?? 0).toLocaleString(),
          }))
        )
      } catch (error) {
        console.error('Failed to load top content', error)
      }
    }
    loadTopContent()
  }, [range.start, range.end, contentType])

  useEffect(() => {
    async function loadLatestContent() {
      try {
        const today = new Date()
        const end = today.toISOString().slice(0, 10)
        const start = new Date(today)
        start.setDate(start.getDate() - 89)
        const startDate = start.toISOString().slice(0, 10)
        const [longformRes, shortRes] = await Promise.all([
          fetch(
            `http://localhost:8000/analytics/top-content?start_date=${startDate}&end_date=${end}&limit=10&content_type=video&sort_by=views&direction=desc&privacy_status=public`
          ),
          fetch(
            `http://localhost:8000/analytics/top-content?start_date=${startDate}&end_date=${end}&limit=10&content_type=short&sort_by=views&direction=desc&privacy_status=public`
          ),
        ])
        const [longformData, shortData] = await Promise.all([longformRes.json(), shortRes.json()])
        const mapItems = (payload: any): LatestContentItem[] =>
          (Array.isArray(payload?.items) ? payload.items : []).map((item: any) => ({
            video_id: String(item.video_id ?? ''),
            title: String(item.title ?? '(untitled)'),
            thumbnail_url: String(item.thumbnail_url ?? ''),
            published_at: String(item.published_at ?? ''),
            views: Number(item.views ?? 0),
            watch_time_minutes: Number(item.watch_time_minutes ?? 0),
            avg_view_duration_seconds: Number(item.avg_view_duration_seconds ?? 0),
            avg_view_pct: Number(item.avg_view_pct ?? 0),
          }))
        setLatestLongform(mapItems(longformData))
        setLatestShorts(mapItems(shortData))
      } catch (error) {
        console.error('Failed to load latest content cards', error)
        setLatestLongform([])
        setLatestShorts([])
      }
    }
    loadLatestContent()
  }, [])

  const metricsData = useMemo<MetricItem[]>(
    () => [
      {
        key: 'views',
        label: 'Views',
        value: formatWholeNumber(totals.views),
        series: [{ key: 'views', label: '', color: '#0ea5e9', points: series.views ?? [] }],
        previousSeries: [{ key: 'views', label: '', color: '#0ea5e9', points: previousSeries.views ?? [] }],
        spikeRegions: viewsSpikes,
      },
      {
        key: 'watch_time',
        label: 'Watch time (hours)',
        value: formatWholeNumber(Math.round(totals.watch_time_minutes / 60)),
        series: [{ key: 'watch_time', label: '', color: '#0ea5e9', points: series.watch_time ?? [] }],
        previousSeries: [{ key: 'watch_time', label: '', color: '#0ea5e9', points: previousSeries.watch_time ?? [] }],
        spikeRegions: watchTimeSpikes,
      },
      {
        key: 'subscribers',
        label: 'Subscribers',
        value: formatWholeNumber(totals.subscribers_net ?? 0),
        series: [{ key: 'subscribers', label: '', color: '#0ea5e9', points: series.subscribers ?? [] }],
        previousSeries: [{ key: 'subscribers', label: '', color: '#0ea5e9', points: previousSeries.subscribers ?? [] }],
        spikeRegions: subscribersSpikes,
      },
      {
        key: 'revenue',
        label: 'Estimated revenue',
        value: formatCurrency(totals.estimated_revenue),
        series: [{ key: 'revenue', label: '', color: '#0ea5e9', points: series.revenue ?? [] }],
        previousSeries: [{ key: 'revenue', label: '', color: '#0ea5e9', points: previousSeries.revenue ?? [] }],
        spikeRegions: revenueSpikes,
      },
    ],
    [totals, series, previousSeries, viewsSpikes, watchTimeSpikes, subscribersSpikes, revenueSpikes]
  )

  return (
    <div className="analytics-main-layout">
      <div className="analytics-main-column">
        <PageCard style={{ position: 'relative' }}>
          <MetricChartCard
            data={metricsData}
            granularity={granularity}
            publishedDates={publishedDates}
          />
          <UploadPublishTooltip
            hover={hoverSpike}
            titleOverride={hoverSpike ? `Spike: ${hoverSpike.startDate} → ${hoverSpike.endDate}` : undefined}
            statsOverride={hoverSpike ? [`${hoverSpike.items.length} top ${hoverSpike.items.length === 1 ? 'video' : 'videos'} during spike`] : undefined}
            onMouseEnter={() => {
              if (spikeTimeoutRef.current) {
                window.clearTimeout(spikeTimeoutRef.current)
              }
              spikeHoverLockedRef.current = true
            }}
            onMouseLeave={() => {
              spikeHoverLockedRef.current = false
              if (spikeTimeoutRef.current) {
                window.clearTimeout(spikeTimeoutRef.current)
              }
              spikeTimeoutRef.current = window.setTimeout(() => {
                if (!spikeHoverLockedRef.current) {
                  setHoverSpike(null)
                }
              }, 150)
            }}
          />
        </PageCard>
        <PageCard>
          <TopContentTable items={topContent} />
        </PageCard>
      </div>
      <div className="analytics-side-cards">
        <PageCard>
          <VideoDetailListCard title="Top longform content (last 90 days)" items={latestLongform} onOpenVideo={onOpenVideo} />
        </PageCard>
        <PageCard>
          <VideoDetailListCard title="Top short content (last 90 days)" items={latestShorts} onOpenVideo={onOpenVideo} />
        </PageCard>
      </div>
    </div>
  )
}

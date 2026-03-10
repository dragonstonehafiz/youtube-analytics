import { useState, useEffect, useMemo } from 'react'
import { MetricChartCard, type Granularity, type SeriesPoint, type MetricItem, type PublishedItem } from '../../components/charts'
import { PageCard, VideoDetailListCard } from '../../components/cards'
import { TopContentTable } from '../../components/tables'
import { fillDayGaps, formatDisplayDate } from '../../utils/date'
import { formatCurrency, formatDuration, formatWholeNumber } from '../../utils/number'
import UploadPublishTooltip from '../../components/charts/UploadPublishTooltip'
import { useSpikes } from '../../hooks/useSpikes'
import { useSpikeHover } from '../../hooks/useSpikeHover'
import { useChannelAnalytics } from '../../hooks/useChannelAnalytics'

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

export default function MetricsTab({ range, previousRange, granularity, contentType, onOpenVideo, publishedDates }: Props) {
  const [topContent, setTopContent] = useState<TopContentRow[]>([])
  const [latestLongform, setLatestLongform] = useState<LatestContentItem[]>([])
  const [latestShorts, setLatestShorts] = useState<LatestContentItem[]>([])
  const { hoverSpike, hoverHandlers } = useSpikeHover()
  const { setHoverSpike, spikeTimeoutRef, spikeHoverLockedRef } = hoverHandlers
  const emptyVideoIds = useMemo(() => [], [])

  const viewsSpikes = useSpikes(range.start, range.end, 'views', granularity, hoverHandlers, emptyVideoIds)
  const watchTimeSpikes = useSpikes(range.start, range.end, 'watch_time_minutes', granularity, hoverHandlers, emptyVideoIds)
  const subscribersSpikes = useSpikes(range.start, range.end, 'subscribers_gained', granularity, hoverHandlers, emptyVideoIds)
  const revenueSpikes = useSpikes(range.start, range.end, 'estimated_revenue', granularity, hoverHandlers, emptyVideoIds)

  const { rows: channelRows, previousRows: channelPreviousRows, totals: channelTotals } = useChannelAnalytics(contentType, range, previousRange)

  const totals = useMemo<TotalsState>(() => {
    const avgDuration =
      channelRows.length > 0
        ? channelRows.reduce((sum, r) => sum + (r.average_view_duration_seconds ?? 0), 0) / channelRows.length
        : 0
    const subscribersNet = channelRows.reduce((sum, r) => sum + ((r.subscribers_gained ?? 0) - (r.subscribers_lost ?? 0)), 0)
    return {
      views: Number(channelTotals.views ?? 0),
      watch_time_minutes: Number(channelTotals.watch_time_minutes ?? 0),
      avg_view_duration_seconds: avgDuration,
      estimated_revenue: Number(channelTotals.estimated_revenue ?? 0),
      subscribers_net: subscribersNet,
    }
  }, [channelRows, channelTotals])



  useEffect(() => {
    async function loadTopContent() {
      try {
        const contentParam = contentType === 'all' ? '' : `&content_type=${contentType}`
        const response = await fetch(
          `http://localhost:8000/analytics/top-content?start_date=${range.start}&end_date=${range.end}&limit=10${contentParam}`
        )
        const data = await response.json()
        const items = Array.isArray(data.items) ? data.items : []
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

  const metricsData = useMemo<MetricItem[]>(() => [
    {
      key: 'views',
      label: 'Views',
      value: formatWholeNumber(totals.views),
      series: [{
        key: 'views',
        label: '',
        color: '#0ea5e9',
        points: channelRows.length > 0 ? fillDayGaps(channelRows.map((r) => r.day).filter(Boolean)).map((day) => {
          const byDay = new Map(channelRows.map((r) => [r.day, r]))
          return { date: day, value: Number(byDay.get(day)?.views ?? 0) }
        }) : [],
      }],
      previousSeries: [{
        key: 'views',
        label: '',
        color: '#0ea5e9',
        points: channelPreviousRows.length > 0 ? fillDayGaps(channelPreviousRows.map((r) => r.day).filter(Boolean)).map((day) => {
          const byDay = new Map(channelPreviousRows.map((r) => [r.day, r]))
          return { date: day, value: Number(byDay.get(day)?.views ?? 0) }
        }) : [],
      }],
      spikeRegions: viewsSpikes,
    },
    {
      key: 'watch_time',
      label: 'Watch time (hours)',
      value: formatWholeNumber(Math.round(totals.watch_time_minutes / 60)),
      series: [{
        key: 'watch_time',
        label: '',
        color: '#0ea5e9',
        points: channelRows.length > 0 ? fillDayGaps(channelRows.map((r) => r.day).filter(Boolean)).map((day) => {
          const byDay = new Map(channelRows.map((r) => [r.day, r]))
          return { date: day, value: Math.round(Number(byDay.get(day)?.watch_time_minutes ?? 0) / 60) }
        }) : [],
      }],
      previousSeries: [{
        key: 'watch_time',
        label: '',
        color: '#0ea5e9',
        points: channelPreviousRows.length > 0 ? fillDayGaps(channelPreviousRows.map((r) => r.day).filter(Boolean)).map((day) => {
          const byDay = new Map(channelPreviousRows.map((r) => [r.day, r]))
          return { date: day, value: Math.round(Number(byDay.get(day)?.watch_time_minutes ?? 0) / 60) }
        }) : [],
      }],
      spikeRegions: watchTimeSpikes,
    },
    {
      key: 'subscribers',
      label: 'Subscribers',
      value: formatWholeNumber(totals.subscribers_net ?? 0),
      series: [{
        key: 'subscribers',
        label: '',
        color: '#0ea5e9',
        points: channelRows.length > 0 ? fillDayGaps(channelRows.map((r) => r.day).filter(Boolean)).map((day) => {
          const byDay = new Map(channelRows.map((r) => [r.day, r]))
          return { date: day, value: Number(byDay.get(day)?.subscribers_gained ?? 0) - Number(byDay.get(day)?.subscribers_lost ?? 0) }
        }) : [],
      }],
      previousSeries: [{
        key: 'subscribers',
        label: '',
        color: '#0ea5e9',
        points: channelPreviousRows.length > 0 ? fillDayGaps(channelPreviousRows.map((r) => r.day).filter(Boolean)).map((day) => {
          const byDay = new Map(channelPreviousRows.map((r) => [r.day, r]))
          return { date: day, value: Number(byDay.get(day)?.subscribers_gained ?? 0) - Number(byDay.get(day)?.subscribers_lost ?? 0) }
        }) : [],
      }],
      spikeRegions: subscribersSpikes,
    },
    {
      key: 'revenue',
      label: 'Estimated revenue',
      value: formatCurrency(totals.estimated_revenue),
      series: [{
        key: 'revenue',
        label: '',
        color: '#0ea5e9',
        points: channelRows.length > 0 ? fillDayGaps(channelRows.map((r) => r.day).filter(Boolean)).map((day) => {
          const byDay = new Map(channelRows.map((r) => [r.day, r]))
          return { date: day, value: Number(byDay.get(day)?.estimated_revenue ?? 0) }
        }) : [],
      }],
      previousSeries: [{
        key: 'revenue',
        label: '',
        color: '#0ea5e9',
        points: channelPreviousRows.length > 0 ? fillDayGaps(channelPreviousRows.map((r) => r.day).filter(Boolean)).map((day) => {
          const byDay = new Map(channelPreviousRows.map((r) => [r.day, r]))
          return { date: day, value: Number(byDay.get(day)?.estimated_revenue ?? 0) }
        }) : [],
      }],
      spikeRegions: revenueSpikes,
    },
  ], [totals, channelRows, channelPreviousRows, viewsSpikes, watchTimeSpikes, subscribersSpikes, revenueSpikes])

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

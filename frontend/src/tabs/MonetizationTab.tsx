import { useState, useEffect, useMemo } from 'react'
import { MetricChartCard, type MetricItem, type Granularity } from '@components/charts'
import { MonetizationContentPerformanceCard, MonetizationEarningsCard, PageCard } from '@components/cards'
import { formatCurrency, formatWholeNumber } from '@utils/number'
import { fillDayGaps } from '@utils/date'
import SpikeTooltipOverlay from '@components/charts/SpikeTooltipOverlay'
import { useSpikes } from '@hooks/useSpikes'
import { useSpikeHover } from '@hooks/useSpikeHover'
import { useHideMonetaryValues } from '@hooks/usePrivacyMode'
import { buildMonthlyEarnings } from '@utils/analytics'
import type { MonetizationContentType, MonetizationPerformance, MonetizationTopItem } from '@types'
import type { TabDataSource } from '@types'
import type { VideoDetailListItem } from '@components/cards'

type ContentSummaryPayload = { totals?: { views?: number; estimated_revenue?: number } }
type ContentTopItem = { video_id?: string; title?: string; thumbnail_url?: string; estimated_revenue?: number }
type ContentTopPayload = { items?: ContentTopItem[] }
type PlaylistItemRowData = {
  video_id?: string; title?: string; video_title?: string
  thumbnail_url?: string; video_thumbnail_url?: string
  published_at?: string; video_published_at?: string
  views?: number; video_recent_views?: number
  video_watch_time_minutes?: number; video_average_view_duration_seconds?: number
}

const EMPTY_PERFORMANCE: Record<MonetizationContentType, MonetizationPerformance> = {
  video: { views: 0, estimated_revenue: 0, rpm: 0, items: [] },
  short: { views: 0, estimated_revenue: 0, rpm: 0, items: [] },
}

type Props = {
  range: { start: string; end: string }
  previousRange: { start: string; end: string; daySpan?: number }
  granularity: Granularity
  dataSources: TabDataSource[]
  selectedSourceIndex: number
}

export default function MonetizationTab({ range, granularity, dataSources, selectedSourceIndex }: Props) {
  const hideMonetaryValues = useHideMonetaryValues()
  const selected = dataSources[selectedSourceIndex]
  const dailyRows = selected?.dailyRows ?? []
  const previousDailyRows = selected?.previousDailyRows ?? []
  const videoIds = selected?.videoIds ?? []
  const contentType = selected?.contentType
  const playlistId = selected?.playlistId
  const publishedDates = selected?.publishedDates ?? {}

  const [monetizationContentType, setMonetizationContentType] = useState<MonetizationContentType>('video')
  const [contentPerformance, setContentPerformance] = useState<Record<MonetizationContentType, MonetizationPerformance>>(EMPTY_PERFORMANCE)
  const [topPerformingItems, setTopPerformingItems] = useState<VideoDetailListItem[]>([])
  const [recentPerformingItems, setRecentPerformingItems] = useState<VideoDetailListItem[]>([])

  const { hoverSpike, hoverHandlers } = useSpikeHover()
  const dataSourceLevel = selected?.dataSourceLevel ?? 'video'

  // For Playlist Detail, only show spikes if videoIds are loaded
  const isPlaylistDetail = !!playlistId
  const hasLoadedVideoIds = videoIds.length > 0
  const shouldShowSpikes = !isPlaylistDetail || hasLoadedVideoIds

  const revenueSpikeRaw = useSpikes(range.start, range.end, 'estimated_revenue', granularity, hoverHandlers, videoIds, contentType, dataSourceLevel)
  const adImpressionsSpikeRaw = useSpikes(range.start, range.end, 'ad_impressions', granularity, hoverHandlers, videoIds, contentType, dataSourceLevel)
  const monetizedPlaybacksSpikeRaw = useSpikes(range.start, range.end, 'monetized_playbacks', granularity, hoverHandlers, videoIds, contentType, dataSourceLevel)

  const revenueSpikes = shouldShowSpikes ? revenueSpikeRaw : []
  const adImpressionsSpikes = shouldShowSpikes ? adImpressionsSpikeRaw : []
  const monetizedPlaybacksSpikes = shouldShowSpikes ? monetizedPlaybacksSpikeRaw : []

  useEffect(() => {
    if (!contentType) return
    async function loadContentPerformance() {
      try {
        const mapPerformance = (summaryPayload: ContentSummaryPayload, topPayload: ContentTopPayload): MonetizationPerformance => {
          const views = Number(summaryPayload?.totals?.views ?? 0)
          const estimatedRevenue = Number(summaryPayload?.totals?.estimated_revenue ?? 0)
          const rpm = views > 0 ? (estimatedRevenue / views) * 1000 : 0
          const topItems = Array.isArray(topPayload?.items) ? topPayload.items : []
          return { views, estimated_revenue: estimatedRevenue, rpm, items: topItems.map((item) => ({ video_id: String(item?.video_id ?? ''), title: String(item?.title ?? '(untitled)'), thumbnail_url: String(item?.thumbnail_url ?? ''), revenue: Number(item?.estimated_revenue ?? 0) })) }
        }
        const performance: Record<MonetizationContentType, MonetizationPerformance> = { ...EMPTY_PERFORMANCE }
        if (contentType === 'all') {
          const [videoSummaryRes, shortSummaryRes, videoTopRes, shortTopRes] = await Promise.all([
            fetch(`http://localhost:8000/analytics/daily/summary?start_date=${range.start}&end_date=${range.end}&content_type=video`),
            fetch(`http://localhost:8000/analytics/daily/summary?start_date=${range.start}&end_date=${range.end}&content_type=short`),
            fetch(`http://localhost:8000/analytics/top-content?start_date=${range.start}&end_date=${range.end}&limit=10&content_type=video&sort_by=estimated_revenue&direction=desc&privacy_status=public`),
            fetch(`http://localhost:8000/analytics/top-content?start_date=${range.start}&end_date=${range.end}&limit=10&content_type=short&sort_by=estimated_revenue&direction=desc&privacy_status=public`),
          ])
          const [vs, ss, vt, st] = await Promise.all([videoSummaryRes.json(), shortSummaryRes.json(), videoTopRes.json(), shortTopRes.json()])
          performance.video = mapPerformance(vs, vt)
          performance.short = mapPerformance(ss, st)
        } else {
          const [summaryRes, topRes] = await Promise.all([
            fetch(`http://localhost:8000/analytics/daily/summary?start_date=${range.start}&end_date=${range.end}&content_type=${contentType}`),
            fetch(`http://localhost:8000/analytics/top-content?start_date=${range.start}&end_date=${range.end}&limit=10&content_type=${contentType}&sort_by=estimated_revenue&direction=desc&privacy_status=public`),
          ])
          const [summary, topContent] = await Promise.all([summaryRes.json(), topRes.json()])
          if (contentType === 'video') performance.video = mapPerformance(summary, topContent)
          else performance.short = mapPerformance(summary, topContent)
        }
        setContentPerformance(performance)
      } catch {
        setContentPerformance(EMPTY_PERFORMANCE)
      }
    }
    loadContentPerformance()
  }, [range.start, range.end, contentType])

  useEffect(() => {
    if (!playlistId) { setTopPerformingItems([]); return }
    async function loadTopPerformingItems() {
      try {
        const params = new URLSearchParams({ limit: '10', offset: '0', sort_by: 'views', direction: 'desc' })
        const response = await fetch(`http://localhost:8000/playlists/${playlistId}/items?${params.toString()}`)
        if (!response.ok) throw new Error()
        const data = await response.json()
        const rows = Array.isArray(data.items) ? (data.items as PlaylistItemRowData[]) : []
        setTopPerformingItems(rows.filter((item) => Boolean(item.video_id)).map((item) => ({ video_id: item.video_id as string, title: item.video_title || item.title || '(untitled)', thumbnail_url: item.video_thumbnail_url || item.thumbnail_url || '', published_at: item.video_published_at || item.published_at || '', views: item.views ?? 0, watch_time_minutes: item.video_watch_time_minutes ?? 0, avg_view_duration_seconds: item.video_average_view_duration_seconds ?? 0, avg_view_pct: 0 })))
      } catch { setTopPerformingItems([]) }
    }
    loadTopPerformingItems()
  }, [playlistId])

  useEffect(() => {
    if (!playlistId) { setRecentPerformingItems([]); return }
    async function loadRecentPerformingItems() {
      try {
        const params = new URLSearchParams({ limit: '10', offset: '0', sort_by: 'recent_views', direction: 'desc' })
        const response = await fetch(`http://localhost:8000/playlists/${playlistId}/items?${params.toString()}`)
        if (!response.ok) throw new Error()
        const data = await response.json()
        const rows = Array.isArray(data.items) ? (data.items as PlaylistItemRowData[]) : []
        setRecentPerformingItems(rows.filter((item) => Boolean(item.video_id)).map((item) => ({ video_id: item.video_id as string, title: item.video_title || item.title || '(untitled)', thumbnail_url: item.video_thumbnail_url || item.thumbnail_url || '', published_at: item.video_published_at || item.published_at || '', views: item.video_recent_views ?? 0, watch_time_minutes: item.video_watch_time_minutes ?? 0, avg_view_duration_seconds: item.video_average_view_duration_seconds ?? 0, avg_view_pct: 0 })))
      } catch { setRecentPerformingItems([]) }
    }
    loadRecentPerformingItems()
  }, [playlistId])

  const monetizationTotals = useMemo(() => {
    // Use pre-computed totals when available (analytics case: has ad_impressions/cpm from channel totals)
    if (selected?.totals && selected.totals['ad_impressions'] !== undefined) {
      return {
        estimated_revenue: Number(selected.totals['estimated_revenue'] ?? 0),
        ad_impressions: Number(selected.totals['ad_impressions'] ?? 0),
        monetized_playbacks: Number(selected.totals['monetized_playbacks'] ?? 0),
        cpm: Number(selected.totals['cpm'] ?? 0),
      }
    }
    // Compute from rows (playlist case: video rows without pre-aggregated monetization totals)
    const filtered = dailyRows.filter((r) => typeof r.day === 'string' && r.day >= range.start && r.day <= range.end)
    const adImpressions = filtered.reduce((sum, r) => sum + Number(r.ad_impressions ?? 0), 0)
    const cpmWeighted = adImpressions > 0 ? filtered.reduce((sum, r) => sum + Number(r.cpm ?? 0) * Number(r.ad_impressions ?? 0), 0) / adImpressions : 0
    return {
      estimated_revenue: filtered.reduce((sum, r) => sum + Number(r.estimated_revenue ?? 0), 0),
      ad_impressions: adImpressions,
      monetized_playbacks: filtered.reduce((sum, r) => sum + Number(r.monetized_playbacks ?? 0), 0),
      cpm: cpmWeighted,
    }
  }, [selected, dailyRows, range.start, range.end])

  const monthlyEarnings = useMemo(() => {
    const maxMonths = playlistId ? 6 : 12
    return buildMonthlyEarnings(dailyRows.map((r) => ({ day: r.day, estimated_revenue: r.estimated_revenue })), maxMonths)
  }, [dailyRows, playlistId])

  const playlistSidePerformance = useMemo<Record<MonetizationContentType, MonetizationPerformance>>(() => {
    const buildPerf = (perfItems: VideoDetailListItem[]): MonetizationPerformance => {
      const views = perfItems.reduce((sum, item) => sum + Number(item.views ?? 0), 0)
      const estimatedRevenue = Number(monetizationTotals.estimated_revenue ?? 0)
      const rpm = views > 0 ? (estimatedRevenue / views) * 1000 : 0
      const totalItemViews = perfItems.reduce((sum, item) => sum + Math.max(0, Number(item.views ?? 0)), 0)
      const mappedItems: MonetizationTopItem[] = perfItems.map((item) => {
        const share = totalItemViews > 0 ? Math.max(0, Number(item.views ?? 0)) / totalItemViews : 0
        return { video_id: item.video_id, title: item.title, thumbnail_url: item.thumbnail_url, revenue: estimatedRevenue * share }
      })
      return { views, estimated_revenue: estimatedRevenue, rpm, items: mappedItems }
    }
    return { video: buildPerf(topPerformingItems), short: buildPerf(recentPerformingItems) }
  }, [topPerformingItems, recentPerformingItems, monetizationTotals.estimated_revenue])

  const getSeries = (data: typeof dailyRows, key: keyof typeof dailyRows[0]) => {
    if (data.length === 0) return []
    const byDay = new Map(data.map((r) => [r.day, r]))
    const days = fillDayGaps(data.map((r) => r.day).filter(Boolean))
    return days.map((day) => ({ date: day, value: Number(byDay.get(day)?.[key] ?? 0) }))
  }

  const metricsData = useMemo<MetricItem[]>(() => [
    { key: 'estimated_revenue', label: 'Estimated revenue', value: hideMonetaryValues ? '••••••' : formatCurrency(monetizationTotals.estimated_revenue), series: [{ key: 'estimated_revenue', label: '', color: '#0ea5e9', points: getSeries(dailyRows, 'estimated_revenue') }], previousSeries: [{ key: 'estimated_revenue', label: '', color: '#0ea5e9', points: getSeries(previousDailyRows, 'estimated_revenue') }], spikeRegions: revenueSpikes },
    { key: 'ad_impressions', label: 'Ad impressions', value: formatWholeNumber(monetizationTotals.ad_impressions), series: [{ key: 'ad_impressions', label: '', color: '#0ea5e9', points: getSeries(dailyRows, 'ad_impressions') }], previousSeries: [{ key: 'ad_impressions', label: '', color: '#0ea5e9', points: getSeries(previousDailyRows, 'ad_impressions') }], spikeRegions: adImpressionsSpikes },
    { key: 'monetized_playbacks', label: 'Monetized playbacks', value: formatWholeNumber(monetizationTotals.monetized_playbacks), series: [{ key: 'monetized_playbacks', label: '', color: '#0ea5e9', points: getSeries(dailyRows, 'monetized_playbacks') }], previousSeries: [{ key: 'monetized_playbacks', label: '', color: '#0ea5e9', points: getSeries(previousDailyRows, 'monetized_playbacks') }], spikeRegions: monetizedPlaybacksSpikes },
    { key: 'cpm', label: 'CPM', value: hideMonetaryValues ? '••••••' : formatCurrency(monetizationTotals.cpm), series: [{ key: 'cpm', label: '', color: '#0ea5e9', points: getSeries(dailyRows, 'cpm') }], previousSeries: [{ key: 'cpm', label: '', color: '#0ea5e9', points: getSeries(previousDailyRows, 'cpm') }], comparisonAggregation: 'avg' },
  ], [hideMonetaryValues, monetizationTotals, dailyRows, previousDailyRows, revenueSpikes, adImpressionsSpikes, monetizedPlaybacksSpikes])

  const sidePerformance = playlistId ? playlistSidePerformance : contentPerformance

  return (
    <div className="analytics-monetization-layout">
      <div className="analytics-chart-wrapper">
        <PageCard>
          <MetricChartCard data={metricsData} granularity={granularity} publishedDates={publishedDates} />
          <SpikeTooltipOverlay hoverSpike={hoverSpike} hoverHandlers={hoverHandlers} />
        </PageCard>
      </div>
      <div className="analytics-monetization-cards-row">
        <PageCard>
          <MonetizationEarningsCard items={monthlyEarnings} />
        </PageCard>
        <PageCard>
          <MonetizationContentPerformanceCard
            contentType={monetizationContentType}
            onContentTypeChange={setMonetizationContentType}
            performance={sidePerformance}
            itemCount={7}
          />
        </PageCard>
      </div>
    </div>
  )
}

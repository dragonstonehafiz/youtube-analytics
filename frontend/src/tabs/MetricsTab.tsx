import { useMemo } from 'react'
import { MetricChartCard, type MetricItem, type Granularity } from '../components/charts'
import { PageCard, VideoDetailListCard, type VideoDetailListItem } from '../components/cards'
import { TopContentTable, type TopContentItem } from '../components/tables'
import { formatCurrency, formatWholeNumber } from '../utils/number'
import { fillDayGaps } from '../utils/date'
import SpikeTooltipOverlay from '../components/charts/SpikeTooltipOverlay'
import { useSpikes } from '../hooks/useSpikes'
import { useSpikeHover } from '../hooks/useSpikeHover'
import type { TabDataSource } from '../types'

type Props = {
  range: { start: string; end: string }
  previousRange: { start: string; end: string; daySpan?: number }
  granularity: Granularity
  onOpenVideo: (videoId: string) => void
  dataSources: TabDataSource[]
  selectedSourceIndex: number
  topContent?: TopContentItem[]
  latestLongform?: VideoDetailListItem[]
  latestShorts?: VideoDetailListItem[]
}

export default function MetricsTab({
  range, previousRange, granularity, onOpenVideo,
  dataSources, selectedSourceIndex,
  topContent = [], latestLongform = [], latestShorts = [],
}: Props) {
  const selected = dataSources[selectedSourceIndex]
  const dailyRows = selected?.dailyRows ?? []
  const previousDailyRows = selected?.previousDailyRows ?? []
  const totals = selected?.totals ?? {}
  const publishedDates = selected?.publishedDates ?? {}
  const videoIds = selected?.videoIds ?? []
  const contentType = selected?.contentType || null
  const playlistId = selected?.playlistId
  const dataSourceLevel = selected?.dataSourceLevel ?? 'video'

  const { hoverSpike, hoverHandlers } = useSpikeHover()

  // For Playlist Detail, only show spikes if videoIds are loaded. For Analytics, show spikes regardless
  const isPlaylistDetail = !!playlistId
  const hasLoadedVideoIds = videoIds.length > 0
  const shouldShowSpikes = !isPlaylistDetail || hasLoadedVideoIds

  const viewsSpikesRaw = useSpikes(range.start, range.end, 'views', granularity, hoverHandlers, videoIds, contentType, dataSourceLevel)
  const watchTimeSpikeRaw = useSpikes(range.start, range.end, 'watch_time_minutes', granularity, hoverHandlers, videoIds, contentType, dataSourceLevel)
  const subscribersSpikeRaw = useSpikes(range.start, range.end, 'subscribers_gained', granularity, hoverHandlers, videoIds, contentType, dataSourceLevel)
  const revenueSpikeRaw = useSpikes(range.start, range.end, 'estimated_revenue', granularity, hoverHandlers, videoIds, contentType, dataSourceLevel)

  const viewsSpikes = shouldShowSpikes ? viewsSpikesRaw : []
  const watchTimeSpikes = shouldShowSpikes ? watchTimeSpikeRaw : []
  const subscribersSpikes = shouldShowSpikes ? subscribersSpikeRaw : []
  const revenueSpikes = shouldShowSpikes ? revenueSpikeRaw : []

  const metricsData = useMemo<MetricItem[]>(() => {
    const sorted = [...dailyRows].filter((r) => typeof r.day === 'string' && r.day >= range.start && r.day <= range.end).sort((a, b) => a.day.localeCompare(b.day))
    const prevFiltered = [...previousDailyRows].filter((r) => typeof r.day === 'string' && r.day >= previousRange.start && r.day <= previousRange.end).sort((a, b) => a.day.localeCompare(b.day))

    const byDay = new Map(sorted.map((r) => [r.day, r]))
    const previousByDay = new Map(prevFiltered.map((r) => [r.day, r]))

    const days = sorted.length > 0 ? fillDayGaps(sorted.map((r) => r.day)) : []
    const previousDays = prevFiltered.length > 0 ? fillDayGaps(prevFiltered.map((r) => r.day)) : []

    const subscribersNet = dailyRows.reduce((sum, r) => sum + (r.subscribers_gained ?? 0) - (r.subscribers_lost ?? 0), 0)
    const prevSubscribersNet = previousDailyRows.reduce((sum, r) => sum + (r.subscribers_gained ?? 0) - (r.subscribers_lost ?? 0), 0)

    return [
      {
        key: 'views',
        label: 'Views',
        value: formatWholeNumber(Number(totals['views'] ?? 0)),
        series: [{ key: 'views', label: '', color: '#0ea5e9', points: days.map((day) => ({ date: day, value: byDay.get(day)?.views ?? 0 })) }],
        previousSeries: [{ key: 'views', label: '', color: '#0ea5e9', points: previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.views ?? 0 })) }],
        spikeRegions: viewsSpikes,
      },
      {
        key: 'watch_time',
        label: 'Watch time (hours)',
        value: formatWholeNumber(Math.round(Number(totals['watch_time_minutes'] ?? 0) / 60)),
        series: [{ key: 'watch_time', label: '', color: '#0ea5e9', points: days.map((day) => ({ date: day, value: Math.round((byDay.get(day)?.watch_time_minutes ?? 0) / 60) })) }],
        previousSeries: [{ key: 'watch_time', label: '', color: '#0ea5e9', points: previousDays.map((day) => ({ date: day, value: Math.round((previousByDay.get(day)?.watch_time_minutes ?? 0) / 60) })) }],
        spikeRegions: watchTimeSpikes,
      },
      {
        key: 'subscribers',
        label: 'Subscribers',
        value: formatWholeNumber(subscribersNet),
        series: [{ key: 'subscribers', label: '', color: '#0ea5e9', points: days.map((day) => ({ date: day, value: (byDay.get(day)?.subscribers_gained ?? 0) - (byDay.get(day)?.subscribers_lost ?? 0) })) }],
        previousSeries: [{ key: 'subscribers', label: '', color: '#0ea5e9', points: previousDays.map((day) => ({ date: day, value: (previousByDay.get(day)?.subscribers_gained ?? 0) - (previousByDay.get(day)?.subscribers_lost ?? 0) })) }],
        comparisonValue: formatWholeNumber(prevSubscribersNet),
        spikeRegions: subscribersSpikes,
      },
      {
        key: 'revenue',
        label: 'Estimated revenue',
        value: formatCurrency(Number(totals['estimated_revenue'] ?? 0)),
        series: [{ key: 'revenue', label: '', color: '#0ea5e9', points: days.map((day) => ({ date: day, value: byDay.get(day)?.estimated_revenue ?? 0 })) }],
        previousSeries: [{ key: 'revenue', label: '', color: '#0ea5e9', points: previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.estimated_revenue ?? 0 })) }],
        spikeRegions: revenueSpikes,
      },
    ]
  }, [dailyRows, previousDailyRows, range, previousRange, totals, viewsSpikes, watchTimeSpikes, subscribersSpikes, revenueSpikes])

  return (
    <div className="analytics-main-layout">
      <div className="analytics-main-column">
        <div className="analytics-chart-wrapper">
          <PageCard>
            <MetricChartCard data={metricsData} granularity={granularity} publishedDates={publishedDates} />
            <SpikeTooltipOverlay hoverSpike={hoverSpike} hoverHandlers={hoverHandlers} />
          </PageCard>
        </div>
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

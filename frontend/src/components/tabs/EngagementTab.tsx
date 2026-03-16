import { useMemo, useState, useEffect } from 'react'
import { MetricChartCard, type MetricItem, type Granularity } from '../charts'
import { PageCard, EngagementInsightCommentCard, EngagementInsightSubscriberCard, type CommentVideoItem, type SubscriberVideoItem } from '../cards'
import { formatDuration, formatWholeNumber } from '../../utils/number'
import SpikeTooltipOverlay from '../charts/SpikeTooltipOverlay'
import { useSpikes } from '../../hooks/useSpikes'
import { useSpikeHover } from '../../hooks/useSpikeHover'
import type { TabDataSource } from '../../types'

type Props = {
  range: { start: string; end: string }
  previousRange: { start: string; end: string; daySpan?: number }
  granularity: Granularity
  onOpenVideo: (videoId: string) => void
  dataSources: TabDataSource[]
  selectedSourceIndex: number
}

export default function EngagementTab({ range, granularity, onOpenVideo, dataSources, selectedSourceIndex }: Props) {
  const selected = dataSources[selectedSourceIndex]
  const dailyData = selected?.dailyRows ?? []
  const previousDailyData = selected?.previousDailyRows ?? []
  const videoIds = selected?.videoIds ?? []
  const contentType = selected?.contentType
  const publishedDates = selected?.publishedDates ?? {}
  const videoIdsKey = videoIds.join(',')

  const { hoverSpike, hoverHandlers } = useSpikeHover()

  const [engagementInsights, setEngagementInsights] = useState<{
    total_comments: number
    total_subscribers_gained: number
    top_commented_videos: CommentVideoItem[]
    top_subscriber_videos: SubscriberVideoItem[]
  } | null>(null)
  const [engagementLoading, setEngagementLoading] = useState(false)

  const engagedViewsSpikes = useSpikes(range.start, range.end, 'engaged_views', granularity, hoverHandlers, videoIds)
  const subscribersSpikes = useSpikes(range.start, range.end, 'subscribers_gained', granularity, hoverHandlers, videoIds)

  useEffect(() => {
    async function loadEngagementInsights() {
      // Skip if playlist context with no videos (videoIds empty and no contentType means no data scope)
      if (videoIdsKey.length === 0 && !contentType) { setEngagementInsights(null); return }
      setEngagementLoading(true)
      try {
        const params = new URLSearchParams({ start_date: range.start, end_date: range.end })
        if (contentType && contentType !== 'all') params.set('content_type', contentType)
        if (videoIdsKey.length > 0) params.set('video_ids', videoIdsKey)
        const response = await fetch(`http://localhost:8000/analytics/engagement-insights?${params.toString()}`)
        if (!response.ok) throw new Error(`Failed to load engagement insights (${response.status})`)
        setEngagementInsights(await response.json())
      } catch {
        setEngagementInsights(null)
      } finally {
        setEngagementLoading(false)
      }
    }
    loadEngagementInsights()
  }, [range.start, range.end, contentType, videoIdsKey])

  const currentEngagedViews = dailyData.reduce((sum, item) => sum + (item.engaged_views ?? 0), 0)
  const currentSubscribersNet = dailyData.reduce((sum, item) => sum + ((item.subscribers_gained ?? 0) - (item.subscribers_lost ?? 0)), 0)
  const currentAvgDuration = dailyData.length > 0
    ? dailyData.reduce((sum, item) => sum + (item.average_view_duration_seconds ?? 0), 0) / dailyData.length
    : 0

  const metricsData = useMemo<MetricItem[]>(() => [
    {
      key: 'engaged_views',
      label: 'Engaged Views',
      value: formatWholeNumber(currentEngagedViews),
      series: [{ key: 'engaged_views', label: 'Engaged Views', color: '#0ea5e9', points: dailyData.map((item) => ({ date: item.day, value: item.engaged_views ?? 0 })) }],
      previousSeries: [{ key: 'engaged_views', label: 'Engaged Views', color: '#0ea5e9', points: previousDailyData.map((item) => ({ date: item.day, value: item.engaged_views ?? 0 })) }],
      comparisonAggregation: 'sum', seriesAggregation: 'sum', spikeRegions: engagedViewsSpikes,
    },
    {
      key: 'subscribers_net',
      label: 'Subscribers Net',
      value: formatWholeNumber(currentSubscribersNet),
      series: [{ key: 'subscribers_net', label: 'Subscribers Net', color: '#0ea5e9', points: dailyData.map((item) => ({ date: item.day, value: (item.subscribers_gained ?? 0) - (item.subscribers_lost ?? 0) })) }],
      previousSeries: [{ key: 'subscribers_net', label: 'Subscribers Net', color: '#0ea5e9', points: previousDailyData.map((item) => ({ date: item.day, value: (item.subscribers_gained ?? 0) - (item.subscribers_lost ?? 0) })) }],
      comparisonAggregation: 'sum', seriesAggregation: 'sum', spikeRegions: subscribersSpikes,
    },
    {
      key: 'avg_duration',
      label: 'Avg view duration',
      value: formatDuration(currentAvgDuration),
      series: [{ key: 'avg_duration', label: 'Avg view duration', color: '#0ea5e9', points: dailyData.map((item) => ({ date: item.day, value: item.average_view_duration_seconds ?? 0 })) }],
      previousSeries: [{ key: 'avg_duration', label: 'Avg view duration', color: '#0ea5e9', points: previousDailyData.map((item) => ({ date: item.day, value: item.average_view_duration_seconds ?? 0 })) }],
      seriesAggregation: 'avg', comparisonAggregation: 'avg', isDuration: true,
    },
  ], [dailyData, previousDailyData, currentEngagedViews, currentSubscribersNet, currentAvgDuration, engagedViewsSpikes, subscribersSpikes])

  return (
    <div className="page-row">
      <div className="analytics-chart-wrapper">
        <PageCard>
          <MetricChartCard data={metricsData} granularity={granularity} publishedDates={publishedDates} />
          <SpikeTooltipOverlay hoverSpike={hoverSpike} hoverHandlers={hoverHandlers} />
        </PageCard>
      </div>
      <div className="engagement-insights-wrapper">
        <PageCard>
          {engagementInsights && (
            <EngagementInsightCommentCard
              totalComments={engagementInsights.total_comments}
              topCommentedVideos={engagementInsights.top_commented_videos}
              loading={engagementLoading}
              onOpenVideo={onOpenVideo}
            />
          )}
        </PageCard>
        <PageCard>
          {engagementInsights && (
            <EngagementInsightSubscriberCard
              totalSubscribersGained={engagementInsights.total_subscribers_gained}
              topSubscriberVideos={engagementInsights.top_subscriber_videos}
              loading={engagementLoading}
              onOpenVideo={onOpenVideo}
            />
          )}
        </PageCard>
      </div>
    </div>
  )
}

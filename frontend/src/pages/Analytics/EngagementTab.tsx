import { useMemo, useState, useEffect } from 'react'
import { MetricChartCard, type PublishedItem, type MetricItem, type Granularity } from '../../components/charts'
import { PageCard, EngagementInsightCommentCard, EngagementInsightSubscriberCard, type CommentVideoItem, type SubscriberVideoItem } from '../../components/cards'
import { formatDuration, formatWholeNumber } from '../../utils/number'
import UploadPublishTooltip from '../../components/charts/UploadPublishTooltip'
import { useSpikes } from '../../hooks/useSpikes'
import { useSpikeHover } from '../../hooks/useSpikeHover'
import { useChannelAnalytics } from '../../hooks/useChannelAnalytics'
import { useVideoAnalyticsByContentType } from '../../hooks/useVideoAnalytics'

type Props = {
  range: { start: string; end: string }
  previousRange: { start: string; end: string; daySpan: number }
  granularity: Granularity
  contentType: string
  onOpenVideo: (videoId: string) => void
  publishedDates: Record<string, PublishedItem[]>
}

export default function EngagementTab({ range, previousRange, granularity, contentType, onOpenVideo, publishedDates }: Props) {
  const { hoverSpike, hoverHandlers } = useSpikeHover()
  const { setHoverSpike, spikeTimeoutRef, spikeHoverLockedRef } = hoverHandlers
  const emptyVideoIds = useMemo(() => [], [])

  const [engagementInsights, setEngagementInsights] = useState<{
    total_comments: number
    total_subscribers_gained: number
    top_commented_videos: CommentVideoItem[]
    top_subscriber_videos: SubscriberVideoItem[]
  } | null>(null)
  const [engagementLoading, setEngagementLoading] = useState(false)

  useEffect(() => {
    async function loadEngagementInsights() {
      setEngagementLoading(true)
      try {
        const params = new URLSearchParams({
          start_date: range.start,
          end_date: range.end,
        })
        if (contentType !== 'all') {
          params.set('content_type', contentType)
        }
        const response = await fetch(`http://localhost:8000/analytics/engagement-insights?${params.toString()}`)
        if (!response.ok) throw new Error(`Failed to load engagement insights (${response.status})`)
        const payload = await response.json()
        setEngagementInsights(payload)
      } catch {
        setEngagementInsights(null)
      } finally {
        setEngagementLoading(false)
      }
    }
    loadEngagementInsights()
  }, [range.start, range.end, contentType])
  const engagedViewsSpikes = useSpikes(range.start, range.end, 'engaged_views', granularity, hoverHandlers, emptyVideoIds)
  const subscribersSpikes = useSpikes(range.start, range.end, 'subscribers_gained', granularity, hoverHandlers, emptyVideoIds)

  const isAll = contentType === 'all'
  const channelResult = useChannelAnalytics(contentType, range, previousRange, { skip: !isAll })
  const videoResult = useVideoAnalyticsByContentType(contentType, range, previousRange, { skip: isAll })
  const dailyData = isAll ? channelResult.rows : videoResult.rows
  const previousDailyData = isAll ? channelResult.previousRows : videoResult.previousRows

  const currentEngagedViews = dailyData.reduce(
    (sum, item) => sum + (item.engaged_views ?? 0),
    0
  )

  const currentSubscribersNet = dailyData.reduce(
    (sum, item) => sum + ((item.subscribers_gained ?? 0) - (item.subscribers_lost ?? 0)),
    0
  )

  const metricsData = useMemo<MetricItem[]>(() => [
    {
      key: 'engaged_views',
      label: 'Engaged Views',
      value: formatWholeNumber(currentEngagedViews),
      series: [
        {
          key: 'engaged_views',
          label: 'Engaged Views',
          color: '#0ea5e9',
          points: dailyData.map((item) => ({
            date: item.day,
            value: item.engaged_views ?? 0,
          })),
        },
      ],
      previousSeries: [
        {
          key: 'engaged_views',
          label: 'Engaged Views',
          color: '#0ea5e9',
          points: previousDailyData.map((item) => ({
            date: item.day,
            value: item.engaged_views ?? 0,
          })),
        },
      ],
      comparisonAggregation: 'sum',
      seriesAggregation: 'sum',
      spikeRegions: engagedViewsSpikes,
    },
    {
      key: 'subscribers_net',
      label: 'Subscribers Net',
      value: formatWholeNumber(currentSubscribersNet),
      series: [
        {
          key: 'subscribers_net',
          label: 'Subscribers Net',
          color: '#0ea5e9',
          points: dailyData.map((item) => ({
            date: item.day,
            value: (item.subscribers_gained ?? 0) - (item.subscribers_lost ?? 0),
          })),
        },
      ],
      previousSeries: [
        {
          key: 'subscribers_net',
          label: 'Subscribers Net',
          color: '#0ea5e9',
          points: previousDailyData.map((item) => ({
            date: item.day,
            value: (item.subscribers_gained ?? 0) - (item.subscribers_lost ?? 0),
          })),
        },
      ],
      comparisonAggregation: 'sum',
      seriesAggregation: 'sum',
      spikeRegions: subscribersSpikes,
    },
    {
      key: 'avg_duration',
      label: 'Avg view duration',
      value: formatDuration(dailyData.length > 0 ? dailyData.reduce((sum, item) => sum + (item.average_view_duration_seconds ?? 0), 0) / dailyData.length : 0),
      series: [
        {
          key: 'avg_duration',
          label: 'Avg view duration',
          color: '#0ea5e9',
          points: dailyData.map((item) => ({
            date: item.day,
            value: item.average_view_duration_seconds ?? 0,
          })),
        },
      ],
      previousSeries: [
        {
          key: 'avg_duration',
          label: 'Avg view duration',
          color: '#0ea5e9',
          points: previousDailyData.map((item) => ({
            date: item.day,
            value: item.average_view_duration_seconds ?? 0,
          })),
        },
      ],
      seriesAggregation: 'avg',
      comparisonAggregation: 'avg',
      isDuration: true,
    },
  ], [dailyData, previousDailyData, currentEngagedViews, currentSubscribersNet, engagedViewsSpikes, subscribersSpikes])

  return (
    <div className="page-row">
      <div className="analytics-chart-wrapper">
        <PageCard>
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

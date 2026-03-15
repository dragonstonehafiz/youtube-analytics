import { useMemo, useState, useEffect } from 'react'
import { MetricChartCard, type MetricItem, type Granularity } from '../../components/charts'
import { PageCard, EngagementInsightCommentCard, EngagementInsightSubscriberCard, type CommentVideoItem, type SubscriberVideoItem } from '../../components/cards'
import { formatDuration, formatWholeNumber } from '../../utils/number'
import UploadPublishTooltip from '../../components/charts/UploadPublishTooltip'
import { useSpikes } from '../../hooks/useSpikes'
import { useSpikeHover } from '../../hooks/useSpikeHover'
import { useVideoAnalyticsByIds } from '../../hooks/useVideoAnalytics'

type Props = {
  playlistId: string | undefined
  range: { start: string; end: string }
  previousRange: { start: string; end: string }
  granularity: Granularity
  videoIds: string[]
  onOpenVideo: (videoId: string) => void
}

export default function EngagementTab({ range, previousRange, granularity, videoIds, onOpenVideo }: Props) {
  const { rows: dailyData, previousRows: previousDailyData } = useVideoAnalyticsByIds(videoIds, range, previousRange)
  const { hoverSpike, hoverHandlers } = useSpikeHover()
  const { setHoverSpike, spikeTimeoutRef, spikeHoverLockedRef } = hoverHandlers

  const [engagementInsights, setEngagementInsights] = useState<{
    total_comments: number
    total_subscribers_gained: number
    top_commented_videos: CommentVideoItem[]
    top_subscriber_videos: SubscriberVideoItem[]
  } | null>(null)
  const [engagementLoading, setEngagementLoading] = useState(false)

  useEffect(() => {
    async function loadEngagementInsights() {
      if (videoIds.length === 0) {
        setEngagementInsights(null)
        return
      }
      setEngagementLoading(true)
      try {
        const params = new URLSearchParams({
          start_date: range.start,
          end_date: range.end,
          video_ids: videoIds.join(','),
        })
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
  }, [range.start, range.end, videoIds])

  const engagedViewsSpikes = useSpikes(range.start, range.end, 'engaged_views', granularity, hoverHandlers, videoIds)
  const subscribersSpikes = useSpikes(range.start, range.end, 'subscribers_gained', granularity, hoverHandlers, videoIds)

  const currentEngagedViews = dailyData.reduce(
    (sum, item) => sum + (item.engaged_views ?? 0),
    0
  )

  const currentSubscribersNet = dailyData.reduce(
    (sum, item) => sum + ((item.subscribers_gained ?? 0) - (item.subscribers_lost ?? 0)),
    0
  )

  const currentAvgDuration = dailyData.length > 0
    ? dailyData.reduce((sum, item) => sum + (item.average_view_duration_seconds ?? 0), 0) / dailyData.length
    : 0

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
      value: formatDuration(currentAvgDuration),
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
  ], [dailyData, previousDailyData, engagedViewsSpikes, subscribersSpikes, currentEngagedViews, currentSubscribersNet, currentAvgDuration])

  return (
    <div className="page-row">
      <div className="playlist-chart-wrapper">
        <PageCard>
          <MetricChartCard
            data={metricsData}
            granularity={granularity}
            publishedDates={{}}
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

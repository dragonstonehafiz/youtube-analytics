import { useState, useEffect, useMemo } from 'react'
import { MetricChartCard, type PublishedItem, type MetricItem, type Granularity } from '../../components/charts'
import { formatWholeNumber } from '../../utils/number'

type ChannelDailyData = {
  day: string
  engaged_views: number | null
  subscribers_gained: number | null
  subscribers_lost: number | null
}

type Props = {
  range: { start: string; end: string }
  previousRange: { start: string; end: string; daySpan: number }
  granularity: Granularity
  contentType: string
  onOpenVideo: (videoId: string) => void
  publishedDates: Record<string, PublishedItem[]>
}

export default function EngagementTab({ range, previousRange, granularity, contentType, onOpenVideo, publishedDates }: Props) {
  const [dailyData, setDailyData] = useState<ChannelDailyData[]>([])
  const [previousDailyData, setPreviousDailyData] = useState<ChannelDailyData[]>([])

  useEffect(() => {
    async function loadData() {
      try {
        if (contentType === 'all') {
          // Use channel-daily for all content
          const [currentRes, previousRes] = await Promise.all([
            fetch(`http://localhost:8000/analytics/channel-daily?start_date=${range.start}&end_date=${range.end}`),
            fetch(`http://localhost:8000/analytics/channel-daily?start_date=${previousRange.start}&end_date=${previousRange.end}`),
          ])
          const currentData = await currentRes.json()
          const previousData = await previousRes.json()
          setDailyData(currentData.items || [])
          setPreviousDailyData(previousData.items || [])
        } else {
          // Fetch videos of the selected content type
          const videosRes = await fetch(`http://localhost:8000/videos?content_type=${contentType}&page_size=500`)
          const videosData = await videosRes.json()
          const videoIds = (videosData.items || []).map((v: any) => v.id).filter((id: string) => id)

          if (videoIds.length === 0) {
            setDailyData([])
            setPreviousDailyData([])
            return
          }

          // Fetch aggregated daily engagement data for all videos of this type in a single call
          const videoIdsCsv = videoIds.join(',')
          const [currentRes, previousRes] = await Promise.all([
            fetch(`http://localhost:8000/analytics/video-daily?video_ids=${videoIdsCsv}&start_date=${range.start}&end_date=${range.end}`),
            fetch(`http://localhost:8000/analytics/video-daily?video_ids=${videoIdsCsv}&start_date=${previousRange.start}&end_date=${previousRange.end}`),
          ])

          const currentData = await currentRes.json()
          const previousData = await previousRes.json()

          // Format the data to use 'day' field instead of 'date' for consistency
          const formatData = (items: any[]): ChannelDailyData[] =>
            items.map((item: any) => ({
              day: item.date,
              engaged_views: item.engaged_views,
              subscribers_gained: item.subscribers_gained,
              subscribers_lost: item.subscribers_lost,
            }))

          setDailyData(formatData(currentData.items || []))
          setPreviousDailyData(formatData(previousData.items || []))
        }
      } catch (error) {
        console.error('Failed to load engagement data', error)
      }
    }

    loadData()
  }, [range.start, range.end, previousRange.start, previousRange.end, contentType])

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
    },
  ], [dailyData, previousDailyData])

  return (
    <div className="page-row">
      <MetricChartCard
        data={metricsData}
        granularity={granularity}
        publishedDates={publishedDates}
      />
    </div>
  )
}

import { useState, useEffect, useMemo } from 'react'
import { MetricChartCard, type MetricItem, type Granularity } from '../../components/charts'
import { formatWholeNumber } from '../../utils/number'

type VideoDailyData = {
  date: string
  engaged_views: number | null
  subscribers_gained: number | null
  subscribers_lost: number | null
}

type Props = {
  playlistId: string | undefined
  range: { start: string; end: string }
  previousRange: { start: string; end: string }
  granularity: Granularity
}

export default function EngagementTab({ playlistId, range, previousRange, granularity }: Props) {
  const [dailyData, setDailyData] = useState<VideoDailyData[]>([])
  const [previousDailyData, setPreviousDailyData] = useState<VideoDailyData[]>([])

  useEffect(() => {
    async function loadData() {
      if (!playlistId) {
        setDailyData([])
        setPreviousDailyData([])
        return
      }

      try {
        // Fetch all videos in the playlist
        const itemsRes = await fetch(`http://localhost:8000/playlists/${playlistId}/items?page_size=500`)
        const itemsData = await itemsRes.json()
        const videoIds = (itemsData.items || []).map((item: any) => item.video_id).filter((id: string) => id)

        if (videoIds.length === 0) {
          setDailyData([])
          setPreviousDailyData([])
          return
        }

        // Fetch aggregated daily engagement data for all videos in a single call
        const videoIdsCsv = videoIds.join(',')
        const [currentRes, previousRes] = await Promise.all([
          fetch(`http://localhost:8000/analytics/video-daily?video_ids=${videoIdsCsv}&start_date=${range.start}&end_date=${range.end}`),
          fetch(`http://localhost:8000/analytics/video-daily?video_ids=${videoIdsCsv}&start_date=${previousRange.start}&end_date=${previousRange.end}`),
        ])

        const currentData = await currentRes.json()
        const previousData = await previousRes.json()

        setDailyData(currentData.items || [])
        setPreviousDailyData(previousData.items || [])
      } catch (error) {
        console.error('Failed to load playlist engagement data', error)
        setDailyData([])
        setPreviousDailyData([])
      }
    }

    loadData()
  }, [playlistId, range.start, range.end, previousRange.start, previousRange.end])

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
            date: item.date,
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
            date: item.date,
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
            date: item.date,
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
            date: item.date,
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
        publishedDates={{}}
      />
    </div>
  )
}

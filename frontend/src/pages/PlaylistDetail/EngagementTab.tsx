import { useState, useEffect, useMemo, useRef } from 'react'
import { MetricChartCard, type MetricItem, type Granularity } from '../../components/charts'
import { PageCard } from '../../components/cards'
import { formatWholeNumber } from '../../utils/number'
import UploadPublishTooltip, { type UploadHoverState } from '../../components/charts/UploadPublishTooltip'
import { useSpikes } from '../../hooks/useSpikes'

function formatDurationSeconds(seconds: number | null | undefined): string {
  const value = Number(seconds ?? 0)
  if (!Number.isFinite(value) || value <= 0) return '-'
  const rounded = Math.round(value)
  const mins = Math.floor(rounded / 60)
  const secs = rounded % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

type VideoDailyData = {
  date: string
  engaged_views: number | null
  subscribers_gained: number | null
  subscribers_lost: number | null
  average_view_duration_seconds?: number | null
}

type Props = {
  playlistId: string | undefined
  range: { start: string; end: string }
  previousRange: { start: string; end: string }
  granularity: Granularity
  allPlaylistItems: any[]
}

export default function EngagementTab({ playlistId, range, previousRange, granularity, allPlaylistItems }: Props) {
  const [dailyData, setDailyData] = useState<VideoDailyData[]>([])
  const [previousDailyData, setPreviousDailyData] = useState<VideoDailyData[]>([])
  const [hoverSpike, setHoverSpike] = useState<UploadHoverState | null>(null)
  const spikeTimeoutRef = useRef<number | null>(null)
  const spikeHoverLockedRef = useRef(false)
  const hoverHandlers = useMemo(() => ({ setHoverSpike, spikeTimeoutRef, spikeHoverLockedRef }), [])

  const playlistVideoIds = useMemo(() => {
    return (allPlaylistItems || [])
      .filter((item: any) => item.video_id)
      .map((item: any) => item.video_id as string)
  }, [allPlaylistItems])

  useEffect(() => {
    async function loadData() {
      if (!playlistId) {
        setDailyData([])
        setPreviousDailyData([])
        return
      }

      try {
        const videoIds = playlistVideoIds

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
  }, [playlistId, range.start, range.end, previousRange.start, previousRange.end, playlistVideoIds])

  const engagedViewsSpikes = useSpikes(range.start, range.end, 'engaged_views', granularity, hoverHandlers, playlistVideoIds)
  const subscribersSpikes = useSpikes(range.start, range.end, 'subscribers_gained', granularity, hoverHandlers, playlistVideoIds)

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
      spikeRegions: subscribersSpikes,
    },
    {
      key: 'avg_duration',
      label: 'Avg view duration',
      value: formatDurationSeconds(currentAvgDuration),
      series: [
        {
          key: 'avg_duration',
          label: 'Avg view duration',
          color: '#0ea5e9',
          points: dailyData.map((item) => ({
            date: item.date,
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
            date: item.date,
            value: item.average_view_duration_seconds ?? 0,
          })),
        },
      ],
      seriesAggregation: 'avg',
      comparisonAggregation: 'avg',
      isDuration: true,
    },
  ], [dailyData, previousDailyData, engagedViewsSpikes, subscribersSpikes])

  return (
    <div className="page-row">
      <PageCard style={{ position: 'relative' }}>
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
  )
}

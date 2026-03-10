import { useMemo } from 'react'
import { MetricChartCard, type MetricItem, type Granularity } from '../../components/charts'
import { PageCard } from '../../components/cards'
import { formatDuration, formatWholeNumber } from '../../utils/number'
import { fillDayGaps } from '../../utils/date'
import type { VideoDailyRow } from './VideoDetail'

type DateRange = { start: string; end: string }

type Props = {
  loading: boolean
  error: string | null
  granularity: Granularity
  dailyRows: VideoDailyRow[]
  range: DateRange
  previousRange: DateRange
}

export default function EngagementTab({ loading, error, granularity, dailyRows, range, previousRange }: Props) {
  const metricsData = useMemo<MetricItem[]>(() => {
    const sorted = dailyRows.filter((item) => item.date >= range.start && item.date <= range.end)
    if (sorted.length === 0) {
      return [
        {
          key: 'engaged_views',
          label: 'Engaged Views',
          value: formatWholeNumber(0),
          series: [{ key: 'engaged_views', label: '', color: '#0ea5e9', points: [] }],
          previousSeries: [{ key: 'engaged_views', label: '', color: '#0ea5e9', points: [] }],
        },
        {
          key: 'subscribers_net',
          label: 'Subscribers Net',
          value: formatWholeNumber(0),
          series: [{ key: 'subscribers_net', label: '', color: '#0ea5e9', points: [] }],
          previousSeries: [{ key: 'subscribers_net', label: '', color: '#0ea5e9', points: [] }],
        },
        {
          key: 'avg_duration',
          label: 'Avg view duration',
          value: formatDuration(0),
          series: [{ key: 'avg_duration', label: '', color: '#0ea5e9', points: [] }],
          previousSeries: [{ key: 'avg_duration', label: '', color: '#0ea5e9', points: [] }],
          seriesAggregation: 'avg',
          isDuration: true,
        },
      ]
    }

    const byDay = new Map(sorted.map((item) => [item.date, item]))
    const days = fillDayGaps(sorted.map((item) => item.date))
    const previousSorted = dailyRows.filter((item) => item.date >= previousRange.start && item.date <= previousRange.end)
    const previousByDay = new Map(previousSorted.map((item) => [item.date, item]))
    const previousDays = fillDayGaps(previousSorted.map((item) => item.date))

    const currentEngagedViews = sorted.reduce((sum, item) => sum + (item.engaged_views ?? 0), 0)
    const currentSubscribersNet = sorted.reduce(
      (sum, item) => sum + ((item.subscribers_gained ?? 0) - (item.subscribers_lost ?? 0)),
      0
    )
    const currentAvgDuration = sorted.reduce((sum, item) => sum + (item.average_view_duration_seconds ?? 0), 0) / sorted.length

    return [
      {
        key: 'engaged_views',
        label: 'Engaged Views',
        value: formatWholeNumber(currentEngagedViews),
        series: [
          {
            key: 'engaged_views',
            label: '',
            color: '#0ea5e9',
            points: days.map((day) => ({ date: day, value: byDay.get(day)?.engaged_views ?? 0 })),
          },
        ],
        previousSeries: [
          {
            key: 'engaged_views',
            label: '',
            color: '#0ea5e9',
            points: previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.engaged_views ?? 0 })),
          },
        ],
      },
      {
        key: 'subscribers_net',
        label: 'Subscribers Net',
        value: formatWholeNumber(currentSubscribersNet),
        series: [
          {
            key: 'subscribers_net',
            label: '',
            color: '#0ea5e9',
            points: days.map((day) => {
              const item = byDay.get(day)
              return { date: day, value: (item?.subscribers_gained ?? 0) - (item?.subscribers_lost ?? 0) }
            }),
          },
        ],
        previousSeries: [
          {
            key: 'subscribers_net',
            label: '',
            color: '#0ea5e9',
            points: previousDays.map((day) => {
              const item = previousByDay.get(day)
              return { date: day, value: (item?.subscribers_gained ?? 0) - (item?.subscribers_lost ?? 0) }
            }),
          },
        ],
      },
      {
        key: 'avg_duration',
        label: 'Avg view duration',
        value: formatDuration(Math.round(currentAvgDuration)),
        series: [
          {
            key: 'avg_duration',
            label: '',
            color: '#0ea5e9',
            points: days.map((day) => ({ date: day, value: byDay.get(day)?.average_view_duration_seconds ?? 0 })),
          },
        ],
        previousSeries: [
          {
            key: 'avg_duration',
            label: '',
            color: '#0ea5e9',
            points: previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.average_view_duration_seconds ?? 0 })),
          },
        ],
        seriesAggregation: 'avg',
        comparisonAggregation: 'avg',
        isDuration: true,
      },
    ]
  }, [dailyRows, range.start, range.end, previousRange.start, previousRange.end])

  return (
    <div className="page-row">
      <PageCard>
        {loading ? (
          <div className="video-detail-state">Loading video analytics...</div>
        ) : error ? (
          <div className="video-detail-state">{error}</div>
        ) : (
          <MetricChartCard data={metricsData} granularity={granularity} />
        )}
      </PageCard>
    </div>
  )
}

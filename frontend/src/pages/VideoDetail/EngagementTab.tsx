import { useMemo } from 'react'
import { MetricChartCard, type MetricItem, type Granularity } from '../../components/charts'
import { PageCard } from '../../components/cards'
import { formatWholeNumber } from '../../utils/number'
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

function buildDays(sorted: VideoDailyRow[]): string[] {
  if (sorted.length === 0) return []
  const days: string[] = []
  const cursor = new Date(`${sorted[0].date}T00:00:00Z`)
  const end = new Date(`${sorted[sorted.length - 1].date}T00:00:00Z`)
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
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
      ]
    }

    const byDay = new Map(sorted.map((item) => [item.date, item]))
    const days = buildDays(sorted)
    const previousSorted = dailyRows.filter((item) => item.date >= previousRange.start && item.date <= previousRange.end)
    const previousByDay = new Map(previousSorted.map((item) => [item.date, item]))
    const previousDays = buildDays(previousSorted)

    const currentEngagedViews = sorted.reduce((sum, item) => sum + (item.engaged_views ?? 0), 0)
    const currentSubscribersNet = sorted.reduce(
      (sum, item) => sum + ((item.subscribers_gained ?? 0) - (item.subscribers_lost ?? 0)),
      0
    )

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

import { useMemo } from 'react'
import { MetricChartCard, type MetricItem, type Granularity, type SeriesPoint } from '../../components/charts'
import { PageCard } from '../../components/cards'
import { formatCurrency, formatWholeNumber } from '../../utils/number'
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

export default function AnalyticsTab({ loading, error, granularity, dailyRows, range, previousRange }: Props) {
  const { series, previousSeries, totals } = useMemo(() => {
    const empty = {
      series: { views: [] as SeriesPoint[], watch_time: [] as SeriesPoint[], subscribers: [] as SeriesPoint[], revenue: [] as SeriesPoint[] },
      previousSeries: { views: [] as SeriesPoint[], watch_time: [] as SeriesPoint[], subscribers: [] as SeriesPoint[], revenue: [] as SeriesPoint[] },
      totals: { views: 0, watch_time_minutes: 0, subscribers_net: 0, estimated_revenue: 0 },
    }
    const sorted = dailyRows.filter((item) => item.date >= range.start && item.date <= range.end)
    if (sorted.length === 0) return empty
    const byDay = new Map(sorted.map((item) => [item.date, item]))
    const days = fillDayGaps(sorted.map((item) => item.date))
    const previousSorted = dailyRows.filter((item) => item.date >= previousRange.start && item.date <= previousRange.end)
    const previousByDay = new Map(previousSorted.map((item) => [item.date, item]))
    const previousDays = fillDayGaps(previousSorted.map((item) => item.date))
    return {
      series: {
        views: days.map((day) => ({ date: day, value: byDay.get(day)?.views ?? 0 })),
        watch_time: days.map((day) => ({ date: day, value: Math.round((byDay.get(day)?.watch_time_minutes ?? 0) / 60) })),
        subscribers: days.map((day) => ({ date: day, value: (byDay.get(day)?.subscribers_gained ?? 0) - (byDay.get(day)?.subscribers_lost ?? 0) })),
        revenue: days.map((day) => ({ date: day, value: byDay.get(day)?.estimated_revenue ?? 0 })),
      },
      previousSeries: {
        views: previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.views ?? 0 })),
        watch_time: previousDays.map((day) => ({ date: day, value: Math.round((previousByDay.get(day)?.watch_time_minutes ?? 0) / 60) })),
        subscribers: previousDays.map((day) => ({ date: day, value: (previousByDay.get(day)?.subscribers_gained ?? 0) - (previousByDay.get(day)?.subscribers_lost ?? 0) })),
        revenue: previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.estimated_revenue ?? 0 })),
      },
      totals: {
        views: sorted.reduce((sum, item) => sum + (item.views ?? 0), 0),
        watch_time_minutes: sorted.reduce((sum, item) => sum + (item.watch_time_minutes ?? 0), 0),
        subscribers_net: sorted.reduce((sum, item) => sum + ((item.subscribers_gained ?? 0) - (item.subscribers_lost ?? 0)), 0),
        estimated_revenue: sorted.reduce((sum, item) => sum + (item.estimated_revenue ?? 0), 0),
      },
    }
  }, [dailyRows, range.start, range.end, previousRange.start, previousRange.end])

  const metricsData = useMemo<MetricItem[]>(
    () => [
      {
        key: 'views',
        label: 'Views',
        value: formatWholeNumber(totals.views),
        series: [{ key: 'views', label: '', color: '#0ea5e9', points: series.views }],
        previousSeries: [{ key: 'views', label: '', color: '#0ea5e9', points: previousSeries.views }],
      },
      {
        key: 'watch_time',
        label: 'Watch time (hours)',
        value: formatWholeNumber(Math.round(totals.watch_time_minutes / 60)),
        series: [{ key: 'watch_time', label: '', color: '#0ea5e9', points: series.watch_time }],
        previousSeries: [{ key: 'watch_time', label: '', color: '#0ea5e9', points: previousSeries.watch_time }],
      },
      {
        key: 'subscribers',
        label: 'Subscribers',
        value: formatWholeNumber(totals.subscribers_net),
        series: [{ key: 'subscribers', label: '', color: '#0ea5e9', points: series.subscribers }],
        previousSeries: [{ key: 'subscribers', label: '', color: '#0ea5e9', points: previousSeries.subscribers }],
      },
      {
        key: 'revenue',
        label: 'Estimated revenue',
        value: formatCurrency(totals.estimated_revenue),
        series: [{ key: 'revenue', label: '', color: '#0ea5e9', points: series.revenue }],
        previousSeries: [{ key: 'revenue', label: '', color: '#0ea5e9', points: previousSeries.revenue }],
      },
    ],
    [totals, series, previousSeries]
  )

  return (
    <div className="page-row">
      <PageCard>
        {loading ? (
          <div className="video-detail-state">Loading video analytics...</div>
        ) : error ? (
          <div className="video-detail-state">{error}</div>
        ) : (
          <MetricChartCard
            data={metricsData}
            granularity={granularity}
            publishedDates={{}}
          />
        )}
      </PageCard>
    </div>
  )
}

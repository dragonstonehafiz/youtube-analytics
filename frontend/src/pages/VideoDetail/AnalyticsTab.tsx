import { useMemo } from 'react'
import { MetricChartCard } from '../../components/charts'
import { PageCard } from '../../components/cards'
import { formatCurrency, formatWholeNumber } from '../../utils/number'
import type { VideoDailyRow } from './VideoDetail'

type Granularity = 'daily' | '7d' | '28d' | '90d' | 'monthly' | 'yearly'
type SeriesPoint = { date: string; value: number }
type DateRange = { start: string; end: string }

type Props = {
  loading: boolean
  error: string | null
  granularity: Granularity
  dailyRows: VideoDailyRow[]
  range: DateRange
  previousRange: DateRange
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds < 0) return '-'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remSeconds = seconds % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remSeconds).padStart(2, '0')}`
  return `${minutes}:${String(remSeconds).padStart(2, '0')}`
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

export default function AnalyticsTab({ loading, error, granularity, dailyRows, range, previousRange }: Props) {
  const { series, previousSeries, totals } = useMemo(() => {
    const empty = {
      series: { views: [] as SeriesPoint[], watch_time: [] as SeriesPoint[], avg_duration: [] as SeriesPoint[], revenue: [] as SeriesPoint[] },
      previousSeries: { views: [] as SeriesPoint[], watch_time: [] as SeriesPoint[], avg_duration: [] as SeriesPoint[], revenue: [] as SeriesPoint[] },
      totals: { views: 0, watch_time_minutes: 0, average_view_duration_seconds: 0, estimated_revenue: 0 },
    }
    const sorted = dailyRows.filter((item) => item.date >= range.start && item.date <= range.end)
    if (sorted.length === 0) return empty
    const byDay = new Map(sorted.map((item) => [item.date, item]))
    const days = buildDays(sorted)
    const previousSorted = dailyRows.filter((item) => item.date >= previousRange.start && item.date <= previousRange.end)
    const previousByDay = new Map(previousSorted.map((item) => [item.date, item]))
    const previousDays = buildDays(previousSorted)
    return {
      series: {
        views: days.map((day) => ({ date: day, value: byDay.get(day)?.views ?? 0 })),
        watch_time: days.map((day) => ({ date: day, value: Math.round((byDay.get(day)?.watch_time_minutes ?? 0) / 60) })),
        avg_duration: days.map((day) => ({ date: day, value: byDay.get(day)?.average_view_duration_seconds ?? 0 })),
        revenue: days.map((day) => ({ date: day, value: byDay.get(day)?.estimated_revenue ?? 0 })),
      },
      previousSeries: {
        views: previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.views ?? 0 })),
        watch_time: previousDays.map((day) => ({ date: day, value: Math.round((previousByDay.get(day)?.watch_time_minutes ?? 0) / 60) })),
        avg_duration: previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.average_view_duration_seconds ?? 0 })),
        revenue: previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.estimated_revenue ?? 0 })),
      },
      totals: {
        views: sorted.reduce((sum, item) => sum + (item.views ?? 0), 0),
        watch_time_minutes: sorted.reduce((sum, item) => sum + (item.watch_time_minutes ?? 0), 0),
        average_view_duration_seconds: sorted.reduce((sum, item) => sum + (item.average_view_duration_seconds ?? 0), 0) / Math.max(sorted.length, 1),
        estimated_revenue: sorted.reduce((sum, item) => sum + (item.estimated_revenue ?? 0), 0),
      },
    }
  }, [dailyRows, range.start, range.end, previousRange.start, previousRange.end])

  return (
    <div className="page-row">
      <PageCard>
        {loading ? (
          <div className="video-detail-state">Loading video analytics...</div>
        ) : error ? (
          <div className="video-detail-state">{error}</div>
        ) : (
          <MetricChartCard
            granularity={granularity}
            metrics={[
              { key: 'views', label: 'Views', value: formatWholeNumber(totals.views) },
              { key: 'watch_time', label: 'Watch time (hours)', value: formatWholeNumber(Math.round(totals.watch_time_minutes / 60)) },
              { key: 'avg_duration', label: 'Avg view duration', value: formatDuration(Math.round(totals.average_view_duration_seconds)) },
              { key: 'revenue', label: 'Estimated revenue', value: formatCurrency(totals.estimated_revenue) },
            ]}
            seriesByMetric={{
              views: [{ key: 'views', label: '', color: '#0ea5e9', points: series.views }],
              watch_time: [{ key: 'watch_time', label: '', color: '#0ea5e9', points: series.watch_time }],
              avg_duration: [{ key: 'avg_duration', label: '', color: '#0ea5e9', points: series.avg_duration }],
              revenue: [{ key: 'revenue', label: '', color: '#0ea5e9', points: series.revenue }],
            }}
            previousSeriesByMetric={{
              views: [{ key: 'views', label: '', color: '#0ea5e9', points: previousSeries.views }],
              watch_time: [{ key: 'watch_time', label: '', color: '#0ea5e9', points: previousSeries.watch_time }],
              avg_duration: [{ key: 'avg_duration', label: '', color: '#0ea5e9', points: previousSeries.avg_duration }],
              revenue: [{ key: 'revenue', label: '', color: '#0ea5e9', points: previousSeries.revenue }],
            }}
            comparisonAggregation={{ avg_duration: 'avg' }}
            publishedDates={{}}
          />
        )}
      </PageCard>
    </div>
  )
}

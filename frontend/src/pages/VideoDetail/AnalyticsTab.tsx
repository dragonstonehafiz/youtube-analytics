import { useMemo } from 'react'
import { type MetricItem, type Granularity } from '@components/charts'
import { formatCurrency, formatWholeNumber } from '@utils/number'
import { fillDayGaps } from '@utils/date'
import type { DateRange } from '@types'
import { useVideoDailyRows } from './useVideoDailyRows'
import VideoDetailMetricPanel from './VideoDetailMetricPanel'

type Props = {
  videoId: string | undefined
  granularity: Granularity
  range: DateRange
  previousRange: DateRange
}

export default function AnalyticsTab({ videoId, granularity, range, previousRange }: Props) {
  const { rows: dailyRows, loading, error } = useVideoDailyRows(videoId)
  const totals = useMemo(() => {
    const sorted = dailyRows.filter((item) => item.day >= range.start && item.day <= range.end)
    if (sorted.length === 0) return { views: 0, watch_time_minutes: 0, subscribers_net: 0, estimated_revenue: 0 }
    return {
      views: sorted.reduce((sum, item) => sum + (item.views ?? 0), 0),
      watch_time_minutes: sorted.reduce((sum, item) => sum + (item.watch_time_minutes ?? 0), 0),
      subscribers_net: sorted.reduce((sum, item) => sum + ((item.subscribers_gained ?? 0) - (item.subscribers_lost ?? 0)), 0),
      estimated_revenue: sorted.reduce((sum, item) => sum + (item.estimated_revenue ?? 0), 0),
    }
  }, [dailyRows, range.start, range.end])

  const metricsData = useMemo<MetricItem[]>(() => {
    const sorted = dailyRows.filter((item) => item.day >= range.start && item.day <= range.end)
    const byDay = new Map(sorted.map((item) => [item.day, item]))
    const days = sorted.length > 0 ? fillDayGaps(sorted.map((item) => item.day)) : []

    const previousSorted = dailyRows.filter((item) => item.day >= previousRange.start && item.day <= previousRange.end)
    const previousByDay = new Map(previousSorted.map((item) => [item.day, item]))
    const previousDays = previousSorted.length > 0 ? fillDayGaps(previousSorted.map((item) => item.day)) : []

    return [
      {
        key: 'views',
        label: 'Views',
        value: formatWholeNumber(totals.views),
        series: [{ key: 'views', label: '', color: '#0ea5e9', points: days.map((day) => ({ date: day, value: byDay.get(day)?.views ?? 0 })) }],
        previousSeries: [{ key: 'views', label: '', color: '#0ea5e9', points: previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.views ?? 0 })) }],
      },
      {
        key: 'watch_time',
        label: 'Watch time (hours)',
        value: formatWholeNumber(Math.round(totals.watch_time_minutes / 60)),
        series: [{ key: 'watch_time', label: '', color: '#0ea5e9', points: days.map((day) => ({ date: day, value: Math.round((byDay.get(day)?.watch_time_minutes ?? 0) / 60) })) }],
        previousSeries: [{ key: 'watch_time', label: '', color: '#0ea5e9', points: previousDays.map((day) => ({ date: day, value: Math.round((previousByDay.get(day)?.watch_time_minutes ?? 0) / 60) })) }],
      },
      {
        key: 'subscribers',
        label: 'Subscribers',
        value: formatWholeNumber(totals.subscribers_net),
        series: [{ key: 'subscribers', label: '', color: '#0ea5e9', points: days.map((day) => ({ date: day, value: (byDay.get(day)?.subscribers_gained ?? 0) - (byDay.get(day)?.subscribers_lost ?? 0) })) }],
        previousSeries: [{ key: 'subscribers', label: '', color: '#0ea5e9', points: previousDays.map((day) => ({ date: day, value: (previousByDay.get(day)?.subscribers_gained ?? 0) - (previousByDay.get(day)?.subscribers_lost ?? 0) })) }],
      },
      {
        key: 'revenue',
        label: 'Estimated revenue',
        value: formatCurrency(totals.estimated_revenue),
        series: [{ key: 'revenue', label: '', color: '#0ea5e9', points: days.map((day) => ({ date: day, value: byDay.get(day)?.estimated_revenue ?? 0 })) }],
        previousSeries: [{ key: 'revenue', label: '', color: '#0ea5e9', points: previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.estimated_revenue ?? 0 })) }],
      },
    ]
  }, [dailyRows, range.start, range.end, previousRange.start, previousRange.end, totals])

  return (
    <VideoDetailMetricPanel loading={loading} error={error} granularity={granularity} data={metricsData} />
  )
}

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

export default function MonetizationTab({ videoId, granularity, range, previousRange }: Props) {
  const { rows: dailyRows, loading, error } = useVideoDailyRows(videoId)
  const monetizationTotals = useMemo(() => {
    const sorted = dailyRows.filter((item) => item.day >= range.start && item.day <= range.end)
    if (sorted.length === 0) return { estimated_revenue: 0, ad_impressions: 0, monetized_playbacks: 0, cpm: 0 }
    const totalAdImpressions = sorted.reduce((sum, item) => sum + (item.ad_impressions ?? 0), 0)
    const totalCpmWeighted = sorted.reduce((sum, item) => sum + (item.cpm ?? 0) * (item.ad_impressions ?? 0), 0)
    const totalCpm = totalAdImpressions > 0
      ? totalCpmWeighted / totalAdImpressions
      : sorted.reduce((sum, item) => sum + (item.cpm ?? 0), 0) / Math.max(sorted.length, 1)
    return {
      estimated_revenue: sorted.reduce((sum, item) => sum + (item.estimated_revenue ?? 0), 0),
      ad_impressions: totalAdImpressions,
      monetized_playbacks: sorted.reduce((sum, item) => sum + (item.monetized_playbacks ?? 0), 0),
      cpm: totalCpm,
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
        key: 'estimated_revenue',
        label: 'Estimated revenue',
        value: formatCurrency(monetizationTotals.estimated_revenue),
        series: [{ key: 'estimated_revenue', label: '', color: '#0ea5e9', points: days.map((day) => ({ date: day, value: byDay.get(day)?.estimated_revenue ?? 0 })) }],
        previousSeries: [{ key: 'estimated_revenue', label: '', color: '#0ea5e9', points: previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.estimated_revenue ?? 0 })) }],
      },
      {
        key: 'ad_impressions',
        label: 'Ad impressions',
        value: formatWholeNumber(monetizationTotals.ad_impressions),
        series: [{ key: 'ad_impressions', label: '', color: '#0ea5e9', points: days.map((day) => ({ date: day, value: byDay.get(day)?.ad_impressions ?? 0 })) }],
        previousSeries: [{ key: 'ad_impressions', label: '', color: '#0ea5e9', points: previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.ad_impressions ?? 0 })) }],
      },
      {
        key: 'monetized_playbacks',
        label: 'Monetized playbacks',
        value: formatWholeNumber(monetizationTotals.monetized_playbacks),
        series: [{ key: 'monetized_playbacks', label: '', color: '#0ea5e9', points: days.map((day) => ({ date: day, value: byDay.get(day)?.monetized_playbacks ?? 0 })) }],
        previousSeries: [{ key: 'monetized_playbacks', label: '', color: '#0ea5e9', points: previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.monetized_playbacks ?? 0 })) }],
      },
      {
        key: 'cpm',
        label: 'CPM',
        value: formatCurrency(monetizationTotals.cpm),
        series: [{ key: 'cpm', label: '', color: '#0ea5e9', points: days.map((day) => ({ date: day, value: byDay.get(day)?.cpm ?? 0 })) }],
        previousSeries: [{ key: 'cpm', label: '', color: '#0ea5e9', points: previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.cpm ?? 0 })) }],
        comparisonAggregation: 'avg',
      },
    ]
  }, [dailyRows, range.start, range.end, previousRange.start, previousRange.end, monetizationTotals])

  return (
    <VideoDetailMetricPanel loading={loading} error={error} granularity={granularity} data={metricsData} />
  )
}

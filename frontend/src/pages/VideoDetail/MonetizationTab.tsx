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

export default function MonetizationTab({ loading, error, granularity, dailyRows, range, previousRange }: Props) {
  const { monetizationSeries, previousMonetizationSeries, monetizationTotals } = useMemo(() => {
    const empty = {
      monetizationSeries: { estimated_revenue: [] as SeriesPoint[], ad_impressions: [] as SeriesPoint[], monetized_playbacks: [] as SeriesPoint[], cpm: [] as SeriesPoint[] },
      previousMonetizationSeries: { estimated_revenue: [] as SeriesPoint[], ad_impressions: [] as SeriesPoint[], monetized_playbacks: [] as SeriesPoint[], cpm: [] as SeriesPoint[] },
      monetizationTotals: { estimated_revenue: 0, ad_impressions: 0, monetized_playbacks: 0, cpm: 0 },
    }
    const sorted = dailyRows.filter((item) => item.date >= range.start && item.date <= range.end)
    if (sorted.length === 0) return empty
    const byDay = new Map(sorted.map((item) => [item.date, item]))
    const days = fillDayGaps(sorted.map((item) => item.date))
    const previousSorted = dailyRows.filter((item) => item.date >= previousRange.start && item.date <= previousRange.end)
    const previousByDay = new Map(previousSorted.map((item) => [item.date, item]))
    const previousDays = fillDayGaps(previousSorted.map((item) => item.date))
    const totalAdImpressions = sorted.reduce((sum, item) => sum + (item.ad_impressions ?? 0), 0)
    const totalCpmWeighted = sorted.reduce((sum, item) => sum + (item.cpm ?? 0) * (item.ad_impressions ?? 0), 0)
    const totalCpm = totalAdImpressions > 0
      ? totalCpmWeighted / totalAdImpressions
      : sorted.reduce((sum, item) => sum + (item.cpm ?? 0), 0) / Math.max(sorted.length, 1)
    return {
      monetizationSeries: {
        estimated_revenue: days.map((day) => ({ date: day, value: byDay.get(day)?.estimated_revenue ?? 0 })),
        ad_impressions: days.map((day) => ({ date: day, value: byDay.get(day)?.ad_impressions ?? 0 })),
        monetized_playbacks: days.map((day) => ({ date: day, value: byDay.get(day)?.monetized_playbacks ?? 0 })),
        cpm: days.map((day) => ({ date: day, value: byDay.get(day)?.cpm ?? 0 })),
      },
      previousMonetizationSeries: {
        estimated_revenue: previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.estimated_revenue ?? 0 })),
        ad_impressions: previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.ad_impressions ?? 0 })),
        monetized_playbacks: previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.monetized_playbacks ?? 0 })),
        cpm: previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.cpm ?? 0 })),
      },
      monetizationTotals: {
        estimated_revenue: sorted.reduce((sum, item) => sum + (item.estimated_revenue ?? 0), 0),
        ad_impressions: totalAdImpressions,
        monetized_playbacks: sorted.reduce((sum, item) => sum + (item.monetized_playbacks ?? 0), 0),
        cpm: totalCpm,
      },
    }
  }, [dailyRows, range.start, range.end, previousRange.start, previousRange.end])

  const metricsData = useMemo<MetricItem[]>(
    () => [
      {
        key: 'estimated_revenue',
        label: 'Estimated revenue',
        value: formatCurrency(monetizationTotals.estimated_revenue),
        series: [{ key: 'estimated_revenue', label: '', color: '#0ea5e9', points: monetizationSeries.estimated_revenue }],
        previousSeries: [{ key: 'estimated_revenue', label: '', color: '#0ea5e9', points: previousMonetizationSeries.estimated_revenue }],
      },
      {
        key: 'ad_impressions',
        label: 'Ad impressions',
        value: formatWholeNumber(monetizationTotals.ad_impressions),
        series: [{ key: 'ad_impressions', label: '', color: '#0ea5e9', points: monetizationSeries.ad_impressions }],
        previousSeries: [{ key: 'ad_impressions', label: '', color: '#0ea5e9', points: previousMonetizationSeries.ad_impressions }],
      },
      {
        key: 'monetized_playbacks',
        label: 'Monetized playbacks',
        value: formatWholeNumber(monetizationTotals.monetized_playbacks),
        series: [{ key: 'monetized_playbacks', label: '', color: '#0ea5e9', points: monetizationSeries.monetized_playbacks }],
        previousSeries: [{ key: 'monetized_playbacks', label: '', color: '#0ea5e9', points: previousMonetizationSeries.monetized_playbacks }],
      },
      {
        key: 'cpm',
        label: 'CPM',
        value: formatCurrency(monetizationTotals.cpm),
        series: [{ key: 'cpm', label: '', color: '#0ea5e9', points: monetizationSeries.cpm }],
        previousSeries: [{ key: 'cpm', label: '', color: '#0ea5e9', points: previousMonetizationSeries.cpm }],
        comparisonAggregation: 'avg',
      },
    ],
    [monetizationTotals, monetizationSeries, previousMonetizationSeries]
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
          />
        )}
      </PageCard>
    </div>
  )
}

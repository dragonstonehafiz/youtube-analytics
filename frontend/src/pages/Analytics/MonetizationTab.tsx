import { useState, useEffect, useMemo } from 'react'
import { MetricChartCard, type MetricItem, type SeriesPoint, type Granularity, type PublishedItem } from '../../components/charts'
import { MonetizationContentPerformanceCard, MonetizationEarningsCard, PageCard } from '../../components/cards'
import { formatCurrency, formatWholeNumber } from '../../utils/number'
import { fillDayGaps } from '../../utils/date'
import UploadPublishTooltip from '../../components/charts/UploadPublishTooltip'
import { useSpikes } from '../../hooks/useSpikes'
import { useSpikeHover } from '../../hooks/useSpikeHover'
import { useChannelAnalytics } from '../../hooks/useChannelAnalytics'
import type { MonetizationContentType, MonetizationPerformance, MonetizationMonthly } from '../../utils/monetization'

type Props = {
  range: { start: string; end: string }
  previousRange: { start: string; end: string; daySpan: number }
  granularity: Granularity
  contentType: string
  onOpenVideo: (videoId: string) => void
  publishedDates: Record<string, PublishedItem[]>
}

const EMPTY_PERFORMANCE: Record<MonetizationContentType, MonetizationPerformance> = {
  video: { views: 0, estimated_revenue: 0, rpm: 0, items: [] },
  short: { views: 0, estimated_revenue: 0, rpm: 0, items: [] },
}

export default function MonetizationTab({ range, previousRange, granularity, contentType, onOpenVideo, publishedDates }: Props) {
  const [monetizationContentType, setMonetizationContentType] = useState<MonetizationContentType>('video')
  const [contentPerformance, setContentPerformance] = useState<Record<MonetizationContentType, MonetizationPerformance>>(EMPTY_PERFORMANCE)
  const { hoverSpike, hoverHandlers } = useSpikeHover()
  const { setHoverSpike, spikeTimeoutRef, spikeHoverLockedRef } = hoverHandlers
  const emptyVideoIds = useMemo(() => [], [])
  const revenueSpikes = useSpikes(range.start, range.end, 'estimated_revenue', granularity, hoverHandlers, emptyVideoIds)
  const adImpressionsSpikes = useSpikes(range.start, range.end, 'ad_impressions', granularity, hoverHandlers, emptyVideoIds)
  const monetizedPlaybacksSpikes = useSpikes(range.start, range.end, 'monetized_playbacks', granularity, hoverHandlers, emptyVideoIds)

  const { rows, previousRows, totals: channelTotals } = useChannelAnalytics(contentType, range, previousRange)

  const monetizationTotals = useMemo(() => ({
    estimated_revenue: Number(channelTotals.estimated_revenue ?? 0),
    ad_impressions: Number(channelTotals.ad_impressions ?? 0),
    monetized_playbacks: Number(channelTotals.monetized_playbacks ?? 0),
    cpm: Number(channelTotals.cpm ?? 0),
  }), [channelTotals])


  const monthlyEarnings = useMemo<MonetizationMonthly[]>(() => {
    const monthTotals = new Map<string, number>()
    rows.forEach((r) => {
      const day = String(r.day ?? '')
      if (!day || day.length < 7) return
      const monthKey = day.slice(0, 7)
      monthTotals.set(monthKey, (monthTotals.get(monthKey) ?? 0) + Number(r.estimated_revenue ?? 0))
    })
    return Array.from(monthTotals.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 12)
      .map(([monthKey, amount]) => {
        const [year, month] = monthKey.split('-')
        const dateValue = new Date(Date.UTC(Number(year), Number(month) - 1, 1))
        return {
          monthKey,
          label: dateValue.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
          amount,
        }
      })
  }, [rows])

  useEffect(() => {
    async function loadContentPerformance() {
      try {
        const mapPerformance = (summaryPayload: any, topPayload: any): MonetizationPerformance => {
          const views = Number(summaryPayload?.totals?.views ?? 0)
          const estimatedRevenue = Number(summaryPayload?.totals?.estimated_revenue ?? 0)
          const rpm = views > 0 ? (estimatedRevenue / views) * 1000 : 0
          const topItems = Array.isArray(topPayload?.items) ? topPayload.items : []
          return {
            views,
            estimated_revenue: estimatedRevenue,
            rpm,
            items: topItems.map((item: any) => ({
              video_id: String(item?.video_id ?? ''),
              title: String(item?.title ?? '(untitled)'),
              thumbnail_url: String(item?.thumbnail_url ?? ''),
              revenue: Number(item?.estimated_revenue ?? 0),
            })),
          }
        }

        const performance: Record<MonetizationContentType, MonetizationPerformance> = { ...EMPTY_PERFORMANCE }

        if (contentType === 'all') {
          const [videoSummaryRes, shortSummaryRes, videoTopRes, shortTopRes] = await Promise.all([
            fetch(`http://localhost:8000/analytics/daily/summary?start_date=${range.start}&end_date=${range.end}&content_type=video`),
            fetch(`http://localhost:8000/analytics/daily/summary?start_date=${range.start}&end_date=${range.end}&content_type=short`),
            fetch(`http://localhost:8000/analytics/top-content?start_date=${range.start}&end_date=${range.end}&limit=10&content_type=video&sort_by=estimated_revenue&direction=desc&privacy_status=public`),
            fetch(`http://localhost:8000/analytics/top-content?start_date=${range.start}&end_date=${range.end}&limit=10&content_type=short&sort_by=estimated_revenue&direction=desc&privacy_status=public`),
          ])
          const [videoSummary, shortSummary, videoTop, shortTop] = await Promise.all([
            videoSummaryRes.json(), shortSummaryRes.json(), videoTopRes.json(), shortTopRes.json(),
          ])
          performance.video = mapPerformance(videoSummary, videoTop)
          performance.short = mapPerformance(shortSummary, shortTop)
        } else {
          const [summaryRes, topRes] = await Promise.all([
            fetch(`http://localhost:8000/analytics/daily/summary?start_date=${range.start}&end_date=${range.end}&content_type=${contentType}`),
            fetch(`http://localhost:8000/analytics/top-content?start_date=${range.start}&end_date=${range.end}&limit=10&content_type=${contentType}&sort_by=estimated_revenue&direction=desc&privacy_status=public`),
          ])
          const [summary, topContent] = await Promise.all([summaryRes.json(), topRes.json()])
          if (contentType === 'video') performance.video = mapPerformance(summary, topContent)
          else performance.short = mapPerformance(summary, topContent)
        }

        setContentPerformance(performance)
      } catch {
        setContentPerformance(EMPTY_PERFORMANCE)
      }
    }
    loadContentPerformance()
  }, [range.start, range.end, contentType])

  const metricsData = useMemo<MetricItem[]>(() => {
    const getMonetizationSeries = (data: typeof rows, dataLabel: keyof typeof rows[0]) => {
      if (data.length === 0) return []
      const byDay = new Map(data.map((r) => [r.day, r]))
      const days = fillDayGaps(data.map((r) => r.day).filter(Boolean))
      return days.map((day) => ({ date: day, value: Number(byDay.get(day)?.[dataLabel] ?? 0) }))
    }

    const estimatedRevenueSeries = getMonetizationSeries(rows, 'estimated_revenue')
    const adImpressionsSeries = getMonetizationSeries(rows, 'ad_impressions')
    const monetizedPlaybacksSeries = getMonetizationSeries(rows, 'monetized_playbacks')
    const cpmSeries = getMonetizationSeries(rows, 'cpm')

    const previousEstimatedRevenueSeries = getMonetizationSeries(previousRows, 'estimated_revenue')
    const previousAdImpressionsSeries = getMonetizationSeries(previousRows, 'ad_impressions')
    const previousMonetizedPlaybacksSeries = getMonetizationSeries(previousRows, 'monetized_playbacks')
    const previousCpmSeries = getMonetizationSeries(previousRows, 'cpm')

    return [
      {
        key: 'estimated_revenue',
        label: 'Estimated revenue',
        value: formatCurrency(monetizationTotals.estimated_revenue),
        series: [{ key: 'estimated_revenue', label: '', color: '#0ea5e9', points: estimatedRevenueSeries }],
        previousSeries: [{ key: 'estimated_revenue', label: '', color: '#0ea5e9', points: previousEstimatedRevenueSeries }],
        spikeRegions: revenueSpikes,
      },
      {
        key: 'ad_impressions',
        label: 'Ad impressions',
        value: formatWholeNumber(monetizationTotals.ad_impressions),
        series: [{ key: 'ad_impressions', label: '', color: '#0ea5e9', points: adImpressionsSeries }],
        previousSeries: [{ key: 'ad_impressions', label: '', color: '#0ea5e9', points: previousAdImpressionsSeries }],
        spikeRegions: adImpressionsSpikes,
      },
      {
        key: 'monetized_playbacks',
        label: 'Monetized playbacks',
        value: formatWholeNumber(monetizationTotals.monetized_playbacks),
        series: [{ key: 'monetized_playbacks', label: '', color: '#0ea5e9', points: monetizedPlaybacksSeries }],
        previousSeries: [{ key: 'monetized_playbacks', label: '', color: '#0ea5e9', points: previousMonetizedPlaybacksSeries }],
        spikeRegions: monetizedPlaybacksSpikes,
      },
      {
        key: 'cpm',
        label: 'CPM',
        value: formatCurrency(monetizationTotals.cpm),
        series: [{ key: 'cpm', label: '', color: '#0ea5e9', points: cpmSeries }],
        previousSeries: [{ key: 'cpm', label: '', color: '#0ea5e9', points: previousCpmSeries }],
        comparisonAggregation: 'avg',
      },
    ]
  }, [monetizationTotals, rows, previousRows, revenueSpikes, adImpressionsSpikes, monetizedPlaybacksSpikes])

  return (
    <div className="analytics-monetization-layout">
      <PageCard style={{ position: 'relative' }}>
        <MetricChartCard
          data={metricsData}
          granularity={granularity}
          publishedDates={publishedDates}
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
      <div className="analytics-monetization-cards-row">
        <PageCard>
          <MonetizationEarningsCard items={monthlyEarnings} />
        </PageCard>
        <PageCard>
          <MonetizationContentPerformanceCard
            contentType={monetizationContentType}
            onContentTypeChange={setMonetizationContentType}
            performance={contentPerformance}
            itemCount={7}
            onOpenVideo={onOpenVideo}
          />
        </PageCard>
      </div>
    </div>
  )
}


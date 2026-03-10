import { useState, useEffect, useMemo, useRef } from 'react'
import { MetricChartCard, type MetricItem, type SeriesPoint, type Granularity } from '../../components/charts'
import { MonetizationContentPerformanceCard, MonetizationEarningsCard, PageCard } from '../../components/cards'
import { formatCurrency, formatWholeNumber } from '../../utils/number'
import UploadPublishTooltip, { type UploadHoverState } from '../../components/charts/UploadPublishTooltip'
import { useSpikes } from '../../hooks/useSpikes'
type MonetizationContentType = 'video' | 'short'
type MonetizationMonthly = { monthKey: string; label: string; amount: number }
type MonetizationTopItem = { video_id: string; title: string; thumbnail_url: string; revenue: number }
type MonetizationPerformance = { views: number; estimated_revenue: number; rpm: number; items: MonetizationTopItem[] }

type PublishedItem = {
  video_id?: string
  title: string
  published_at: string
  thumbnail_url: string
  content_type: string
}

type Props = {
  range: { start: string; end: string }
  previousRange: { start: string; end: string; daySpan: number }
  granularity: Granularity
  contentType: string
  onOpenVideo: (videoId: string) => void
  publishedDates: Record<string, PublishedItem[]>
}

function buildDays(items: any[]): [string[], Map<string, any>] {
  const byDay = new Map<string, any>()
  items.forEach((item: any) => {
    if (typeof item?.day === 'string') byDay.set(item.day, item)
  })
  const unique = Array.from(
    new Set<string>(
      items.map((i: any) => i.day).filter((d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
    )
  ).sort((a, b) => a.localeCompare(b))
  if (unique.length === 0) return [[], byDay]
  const days: string[] = []
  const cursor = new Date(`${unique[0]}T00:00:00Z`)
  const end = new Date(`${unique[unique.length - 1]}T00:00:00Z`)
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return [days, byDay]
}

const EMPTY_SERIES = { estimated_revenue: [], ad_impressions: [], monetized_playbacks: [], cpm: [] }
const EMPTY_TOTALS = { estimated_revenue: 0, ad_impressions: 0, monetized_playbacks: 0, cpm: 0 }
const EMPTY_PERFORMANCE: Record<MonetizationContentType, MonetizationPerformance> = {
  video: { views: 0, estimated_revenue: 0, rpm: 0, items: [] },
  short: { views: 0, estimated_revenue: 0, rpm: 0, items: [] },
}

export default function MonetizationTab({ range, previousRange, granularity, contentType, onOpenVideo, publishedDates }: Props) {
  const [monetizationContentType, setMonetizationContentType] = useState<MonetizationContentType>('video')
  const [monetizationTotals, setMonetizationTotals] = useState(EMPTY_TOTALS)
  const [monetizationSeries, setMonetizationSeries] = useState<Record<string, SeriesPoint[]>>(EMPTY_SERIES)
  const [previousMonetizationSeries, setPreviousMonetizationSeries] = useState<Record<string, SeriesPoint[]>>(EMPTY_SERIES)
  const [monthlyEarnings, setMonthlyEarnings] = useState<MonetizationMonthly[]>([])
  const [contentPerformance, setContentPerformance] = useState<Record<MonetizationContentType, MonetizationPerformance>>(EMPTY_PERFORMANCE)
  const [hoverSpike, setHoverSpike] = useState<UploadHoverState | null>(null)
  const spikeTimeoutRef = useRef<number | null>(null)
  const spikeHoverLockedRef = useRef(false)
  const hoverHandlers = useMemo(() => ({ setHoverSpike, spikeTimeoutRef, spikeHoverLockedRef }), [])

  const emptyVideoIds = useMemo(() => [], [])
  const revenueSpikes = useSpikes(range.start, range.end, 'estimated_revenue', granularity, hoverHandlers, emptyVideoIds)
  const adImpressionsSpikes = useSpikes(range.start, range.end, 'ad_impressions', granularity, hoverHandlers, emptyVideoIds)
  const monetizedPlaybacksSpikes = useSpikes(range.start, range.end, 'monetized_playbacks', granularity, hoverHandlers, emptyVideoIds)

  useEffect(() => {
    async function loadMonetizationData() {
      try {
        const summaryUrl =
          contentType === 'all'
            ? `http://localhost:8000/analytics/channel-daily?start_date=${range.start}&end_date=${range.end}`
            : `http://localhost:8000/analytics/daily/summary?start_date=${range.start}&end_date=${range.end}&content_type=${contentType}`
        const previousUrl =
          contentType === 'all'
            ? `http://localhost:8000/analytics/channel-daily?start_date=${previousRange.start}&end_date=${previousRange.end}`
            : `http://localhost:8000/analytics/daily/summary?start_date=${previousRange.start}&end_date=${previousRange.end}&content_type=${contentType}`

        const requests = [
          fetch(summaryUrl),
          fetch(previousUrl),
          fetch(
            `http://localhost:8000/analytics/top-content?start_date=${range.start}&end_date=${range.end}&limit=10${contentType === 'all' ? '' : `&content_type=${contentType}`}&sort_by=estimated_revenue&direction=desc&privacy_status=public`
          ),
        ]

        const topRequests = contentType === 'all' ? [
          fetch(`http://localhost:8000/analytics/daily/summary?start_date=${range.start}&end_date=${range.end}&content_type=video`),
          fetch(`http://localhost:8000/analytics/daily/summary?start_date=${range.start}&end_date=${range.end}&content_type=short`),
          fetch(`http://localhost:8000/analytics/top-content?start_date=${range.start}&end_date=${range.end}&limit=10&content_type=video&sort_by=estimated_revenue&direction=desc&privacy_status=public`),
          fetch(`http://localhost:8000/analytics/top-content?start_date=${range.start}&end_date=${range.end}&limit=10&content_type=short&sort_by=estimated_revenue&direction=desc&privacy_status=public`),
        ] : []

        const responses = await Promise.all([...requests, ...topRequests])
        const [summaryRes, previousSummaryRes, topRes, ...topData] = responses
        const [payload, previousPayload, topContent] = await Promise.all([
          summaryRes.json(),
          previousSummaryRes.json(),
          topRes.json(),
        ])

        let videoSummary = payload
        let shortSummary = payload
        let videoTop = topContent
        let shortTop = topContent

        if (contentType === 'all' && topData.length === 4) {
          const [videoSummaryRes, shortSummaryRes, videoTopRes, shortTopRes] = topData
          videoSummary = await videoSummaryRes.json()
          shortSummary = await shortSummaryRes.json()
          videoTop = await videoTopRes.json()
          shortTop = await shortTopRes.json()
        }

        const items = Array.isArray(payload?.items) ? payload.items : []
        const [days, byDay] = buildDays(items)
        if (days.length === 0) {
          setMonetizationSeries(EMPTY_SERIES)
          setPreviousMonetizationSeries(EMPTY_SERIES)
          setMonetizationTotals(EMPTY_TOTALS)
          return
        }

        setMonetizationSeries({
          estimated_revenue: days.map((day) => ({ date: day, value: Number(byDay.get(day)?.estimated_revenue ?? 0) })),
          ad_impressions: days.map((day) => ({ date: day, value: Number(byDay.get(day)?.ad_impressions ?? 0) })),
          monetized_playbacks: days.map((day) => ({ date: day, value: Number(byDay.get(day)?.monetized_playbacks ?? 0) })),
          cpm: days.map((day) => ({ date: day, value: Number(byDay.get(day)?.cpm ?? 0) })),
        })
        setMonetizationTotals({
          estimated_revenue: Number(payload?.totals?.estimated_revenue ?? 0),
          ad_impressions: Number(payload?.totals?.ad_impressions ?? 0),
          monetized_playbacks: Number(payload?.totals?.monetized_playbacks ?? 0),
          cpm: Number(payload?.totals?.cpm ?? 0),
        })

        const previousItems = Array.isArray(previousPayload?.items) ? previousPayload.items : []
        const [prevDays, prevByDay] = buildDays(previousItems)
        setPreviousMonetizationSeries({
          estimated_revenue: prevDays.map((day) => ({ date: day, value: Number(prevByDay.get(day)?.estimated_revenue ?? 0) })),
          ad_impressions: prevDays.map((day) => ({ date: day, value: Number(prevByDay.get(day)?.ad_impressions ?? 0) })),
          monetized_playbacks: prevDays.map((day) => ({ date: day, value: Number(prevByDay.get(day)?.monetized_playbacks ?? 0) })),
          cpm: prevDays.map((day) => ({ date: day, value: Number(prevByDay.get(day)?.cpm ?? 0) })),
        })

        const monthTotals = new Map<string, number>()
        items.forEach((item: any) => {
          const day = String(item?.day ?? '')
          if (!day || day.length < 7) return
          const monthKey = day.slice(0, 7)
          monthTotals.set(monthKey, (monthTotals.get(monthKey) ?? 0) + Number(item?.estimated_revenue ?? 0))
        })
        setMonthlyEarnings(
          Array.from(monthTotals.entries())
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
        )

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
          performance.video = mapPerformance(videoSummary, videoTop)
          performance.short = mapPerformance(shortSummary, shortTop)
        } else if (contentType === 'video') {
          performance.video = mapPerformance(payload, topContent)
        } else {
          performance.short = mapPerformance(payload, topContent)
        }
        setContentPerformance(performance)
      } catch (error) {
        console.error('Failed to load monetization data', error)
        setMonetizationSeries(EMPTY_SERIES)
        setPreviousMonetizationSeries(EMPTY_SERIES)
        setMonetizationTotals(EMPTY_TOTALS)
        setMonthlyEarnings([])
        setContentPerformance(EMPTY_PERFORMANCE)
      }
    }
    loadMonetizationData()
  }, [range.start, range.end, previousRange.start, previousRange.end, previousRange.daySpan, contentType])

  const metricsData = useMemo<MetricItem[]>(
    () => [
      {
        key: 'estimated_revenue',
        label: 'Estimated revenue',
        value: formatCurrency(monetizationTotals.estimated_revenue),
        series: [{ key: 'estimated_revenue', label: '', color: '#0ea5e9', points: monetizationSeries.estimated_revenue ?? [] }],
        previousSeries: [{ key: 'estimated_revenue', label: '', color: '#0ea5e9', points: previousMonetizationSeries.estimated_revenue ?? [] }],
        spikeRegions: revenueSpikes,
      },
      {
        key: 'ad_impressions',
        label: 'Ad impressions',
        value: formatWholeNumber(monetizationTotals.ad_impressions),
        series: [{ key: 'ad_impressions', label: '', color: '#0ea5e9', points: monetizationSeries.ad_impressions ?? [] }],
        previousSeries: [{ key: 'ad_impressions', label: '', color: '#0ea5e9', points: previousMonetizationSeries.ad_impressions ?? [] }],
        spikeRegions: adImpressionsSpikes,
      },
      {
        key: 'monetized_playbacks',
        label: 'Monetized playbacks',
        value: formatWholeNumber(monetizationTotals.monetized_playbacks),
        series: [{ key: 'monetized_playbacks', label: '', color: '#0ea5e9', points: monetizationSeries.monetized_playbacks ?? [] }],
        previousSeries: [{ key: 'monetized_playbacks', label: '', color: '#0ea5e9', points: previousMonetizationSeries.monetized_playbacks ?? [] }],
        spikeRegions: monetizedPlaybacksSpikes,
      },
      {
        key: 'cpm',
        label: 'CPM',
        value: formatCurrency(monetizationTotals.cpm),
        series: [{ key: 'cpm', label: '', color: '#0ea5e9', points: monetizationSeries.cpm ?? [] }],
        previousSeries: [{ key: 'cpm', label: '', color: '#0ea5e9', points: previousMonetizationSeries.cpm ?? [] }],
        comparisonAggregation: 'avg',
      },
    ],
    [monetizationTotals, monetizationSeries, previousMonetizationSeries, revenueSpikes, adImpressionsSpikes, monetizedPlaybacksSpikes]
  )

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


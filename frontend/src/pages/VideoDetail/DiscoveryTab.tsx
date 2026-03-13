import { useMemo } from 'react'
import { type MetricItem, type Granularity } from '../../components/charts'
import {
  PageCard,
  SearchInsightsTopTermsCard,
  TrafficSourceShareCard,
  type TrafficSourceShareItem,
} from '../../components/cards'
import { buildTrafficSeries } from '../../utils/trafficSeries'
import { formatWholeNumber } from '../../utils/number'
import type { DateRange } from './types'
import VideoDetailMetricPanel from './VideoDetailMetricPanel'
import { useVideoDiscovery } from './useVideoDiscovery'

type Props = {
  videoId: string | undefined
  range: DateRange
  previousRange: DateRange
  granularity: Granularity
}

export default function DiscoveryTab({
  videoId,
  range,
  previousRange,
  granularity,
}: Props) {
  const {
    trafficRows,
    previousTrafficRows,
    trafficLoading,
    trafficError,
    searchTopTerms,
    searchTopTermsLoading,
    searchTopTermsError,
  } = useVideoDiscovery(videoId, range, previousRange)

  const metricsData = useMemo<MetricItem[]>(() => {
    const viewsSeries = buildTrafficSeries(trafficRows, 'views', range.start, range.end)
    const watchTimeSeries = buildTrafficSeries(trafficRows, 'watch_time', range.start, range.end)
    const previousViewsSeries = buildTrafficSeries(previousTrafficRows, 'views', previousRange.start, previousRange.end)
    const previousWatchTimeSeries = buildTrafficSeries(previousTrafficRows, 'watch_time', previousRange.start, previousRange.end)

    const totalViews = viewsSeries.reduce((sum, line) => sum + line.points.reduce((acc, pt) => acc + pt.value, 0), 0)
    const totalWatch = watchTimeSeries.reduce((sum, line) => sum + line.points.reduce((acc, pt) => acc + pt.value, 0), 0)

    return [
      {
        key: 'views',
        label: 'Views',
        value: formatWholeNumber(Math.round(totalViews)),
        series: viewsSeries,
        previousSeries: previousViewsSeries,
      },
      {
        key: 'watch_time',
        label: 'Watch time',
        value: formatWholeNumber(Math.round(totalWatch)),
        series: watchTimeSeries,
        previousSeries: previousWatchTimeSeries,
      },
    ]
  }, [trafficRows, previousTrafficRows, range.start, range.end, previousRange.start, previousRange.end])

  const shareItems = useMemo<TrafficSourceShareItem[]>(() => {
    const totals = new Map<string, number>()
    trafficRows.forEach((row) => {
      if (!row.traffic_source) return
      totals.set(row.traffic_source, (totals.get(row.traffic_source) ?? 0) + row.views)
    })
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([source, views]) => ({ key: source, label: source.replace(/_/g, ' '), views }))
  }, [trafficRows])


  return (
    <>
      <VideoDetailMetricPanel loading={trafficLoading} error={trafficError} granularity={granularity} data={metricsData} />
      {!trafficLoading && !trafficError && (
        <div className="page-row">
          <div className="video-detail-discovery-row">
            <PageCard>
              <TrafficSourceShareCard items={shareItems} />
            </PageCard>
            <PageCard>
              <SearchInsightsTopTermsCard
                items={searchTopTerms}
                loading={searchTopTermsLoading}
                error={searchTopTermsError}
                startDate={range.start}
                endDate={range.end}
                videoIds={videoId ? [videoId] : []}
              />
            </PageCard>
          </div>
        </div>
      )}
    </>
  )
}

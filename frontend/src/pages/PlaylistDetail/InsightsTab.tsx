import { useEffect, useMemo, useState, useRef } from 'react'
import { ContentInsightsCard, DonutChartCard, HistogramChartCard, BarChartCard, type ContentInsights } from '../../components/cards'
import { PageCard } from '../../components/cards'
import UploadPublishTooltip, { type UploadHoverState } from '../../components/charts/UploadPublishTooltip'
import { formatWholeNumber, formatSecondsAsTime } from '../../utils/number'

type Props = {
  playlistId: string | undefined
  range: { start: string; end: string }
}

export default function InsightsTab({ playlistId, range }: Props) {
  const [contentInsights, setContentInsights] = useState<ContentInsights | null>(null)
  const [histogramHover, setHistogramHover] = useState<UploadHoverState | null>(null)
  const [barChartHover, setBarChartHover] = useState<UploadHoverState | null>(null)
  const histogramContainerRef = useRef<HTMLDivElement>(null)
  const barChartContainerRef = useRef<HTMLDivElement>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    async function loadContentInsights() {
      if (!playlistId) { setContentInsights(null); return }
      try {
        const response = await fetch(
          `http://localhost:8000/analytics/content-insights?start_date=${range.start}&end_date=${range.end}&playlist_id=${playlistId}`
        )
        const data = await response.json()
        setContentInsights(data)
      } catch {
        setContentInsights(null)
      }
    }
    loadContentInsights()
  }, [playlistId, range.start, range.end])

  const histogramViewData = useMemo(() => {
    const views = contentInsights?.all_video_views ?? []
    return views.length > 0 ? views : [0]
  }, [contentInsights?.all_video_views])

  const histogramAvgViewDurationData = useMemo(() => {
    const durations = contentInsights?.all_video_avg_view_durations ?? []
    const durationsInMinutes = durations.map((d) => d / 60)
    return durationsInMinutes.length > 0 ? durationsInMinutes : [0]
  }, [contentInsights?.all_video_avg_view_durations])

  const cancelHide = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
  }

  const scheduleHide = () => {
    cancelHide()
    hideTimeoutRef.current = setTimeout(() => {
      setHistogramHover(null)
      setBarChartHover(null)
    }, 150)
  }

  const handleHistogramBinMouseEnter = (_binIndex: number, dataIndices: number[], event: React.MouseEvent<SVGRectElement>) => {
    const videos = contentInsights?.all_videos ?? []
    const views = contentInsights?.all_video_views ?? []
    const videosInBin = dataIndices
      .map((idx) => ({ video: videos[idx], views: views[idx] }))
      .filter((item) => item.video !== undefined)
      .sort((a, b) => b.views - a.views)

    if (videosInBin.length === 0 || !histogramContainerRef.current) return

    cancelHide()
    const container = histogramContainerRef.current.getBoundingClientRect()
    const rect = (event.currentTarget as SVGRectElement).getBoundingClientRect()

    setHistogramHover({
      x: rect.left + rect.width / 2 - container.left,
      y: rect.bottom - container.top,
      items: videosInBin.map((item) => ({
        video_id: item.video.video_id,
        title: item.video.title,
        published_at: '',
        thumbnail_url: item.video.thumbnail_url,
        content_type: '',
        detail: `${formatWholeNumber(item.views)} views · ${formatSecondsAsTime(item.video.avg_view_duration_seconds)} avg duration`,
      })),
      key: 'histogram',
      startDate: range.start,
      endDate: range.end,
      dayCount: 0,
    })
  }

  const handleHistogramBinMouseExit = () => {
    scheduleHide()
  }

  const handleBarChartMouseEnter = (_bar: any, dataIndices: number[], event: React.MouseEvent<SVGRectElement>) => {
    const videos = contentInsights?.all_videos ?? []
    const views = contentInsights?.all_video_views ?? []
    const videosInBar = dataIndices
      .map((idx) => ({ video: videos[idx], views: views[idx] }))
      .filter((item) => item.video !== undefined)
      .sort((a, b) => b.views - a.views)

    if (videosInBar.length === 0 || !barChartContainerRef.current) return

    cancelHide()
    const container = barChartContainerRef.current.getBoundingClientRect()
    const rect = (event.currentTarget as SVGRectElement).getBoundingClientRect()

    setBarChartHover({
      x: rect.left + rect.width / 2 - container.left,
      y: rect.bottom - container.top,
      items: videosInBar.map((item) => ({
        video_id: item.video.video_id,
        title: item.video.title,
        published_at: '',
        thumbnail_url: item.video.thumbnail_url,
        content_type: '',
        detail: `${formatWholeNumber(item.views)} views`,
      })),
      key: 'bar-chart',
      startDate: range.start,
      endDate: range.end,
      dayCount: 0,
    })
  }

  const handleBarChartMouseExit = () => {
    scheduleHide()
  }

  return (
    <div className="page-row">
      <div className="playlist-insights-layout">
        <div className="playlist-insights-left">
          <PageCard>
            <ContentInsightsCard data={contentInsights} range={range} playlistId={playlistId} />
          </PageCard>
          <div ref={histogramContainerRef} style={{ position: 'relative' }}>
            <PageCard title="Distribution of Average View Duration">
              <HistogramChartCard
                viewData={histogramAvgViewDurationData}
                color="#0ea5e9"
                binCount={15}
                onBinMouseEnter={handleHistogramBinMouseEnter}
                onBinMouseExit={handleHistogramBinMouseExit}
              />
            </PageCard>
            <UploadPublishTooltip hover={histogramHover} onMouseEnter={cancelHide} onMouseLeave={scheduleHide} />
          </div>
          <div ref={barChartContainerRef} style={{ position: 'relative' }}>
            <PageCard title="Total Views by Percentile">
              <BarChartCard
                data={histogramViewData}
                color="#0ea5e9"
                onBarMouseEnter={handleBarChartMouseEnter}
                onBarMouseLeave={handleBarChartMouseExit}
              />
            </PageCard>
            <UploadPublishTooltip hover={barChartHover} onMouseEnter={cancelHide} onMouseLeave={scheduleHide} />
          </div>
        </div>
        <div className="playlist-insights-right">
          <PageCard title="New Uploads vs Old Upload Views">
            <DonutChartCard
              segments={[
                { key: 'new', label: 'New uploads', value: contentInsights?.in_period_views ?? 0, color: '#0ea5e9', displayValue: `${contentInsights?.in_period_pct ?? 0}%` },
                { key: 'catalog', label: 'Old uploads', value: contentInsights?.catalog_views ?? 0, color: '#22c55e', displayValue: `${contentInsights?.catalog_pct ?? 0}%` },
              ]}
              centerLabel="Total views"
              centerValue={formatWholeNumber((contentInsights?.in_period_views ?? 0) + (contentInsights?.catalog_views ?? 0))}
              ariaLabel="New uploads vs old uploads views"
            />
          </PageCard>
          <PageCard title="Shortform vs Longform Views">
            <DonutChartCard
              segments={[
                { key: 'short', label: 'Short-form', value: contentInsights?.shortform_views ?? 0, color: '#f97316', displayValue: `${contentInsights?.shortform_pct ?? 0}%` },
                { key: 'long', label: 'Long-form', value: contentInsights?.longform_views ?? 0, color: '#a855f7', displayValue: `${contentInsights?.longform_pct ?? 0}%` },
              ]}
              centerLabel="Total views"
              centerValue={formatWholeNumber((contentInsights?.shortform_views ?? 0) + (contentInsights?.longform_views ?? 0))}
              ariaLabel="Short-form vs long-form views"
            />
          </PageCard>
          <PageCard title="Top 10% vs Other Videos Views">
            {(() => {
              const totalViews = (contentInsights?.in_period_views ?? 0) + (contentInsights?.catalog_views ?? 0)
              const top10Pct = contentInsights?.outlier_share_pct ?? 0
              const top10Views = Math.round(totalViews * (top10Pct / 100))
              const otherViews = totalViews - top10Views
              const otherPct = 100 - top10Pct
              return (
                <DonutChartCard
                  segments={[
                    { key: 'top10', label: 'Top 10%', value: top10Views, color: '#ef4444', displayValue: `${formatWholeNumber(top10Pct)}%` },
                    { key: 'other', label: 'Other videos', value: otherViews, color: '#94a3b8', displayValue: `${formatWholeNumber(otherPct)}%` },
                  ]}
                  centerLabel="Total views"
                  centerValue={formatWholeNumber(totalViews)}
                  ariaLabel="Top 10% vs other videos views"
                />
              )
            })()}
          </PageCard>
        </div>
      </div>
    </div>
  )
}

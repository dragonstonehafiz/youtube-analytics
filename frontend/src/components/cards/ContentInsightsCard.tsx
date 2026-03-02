import { useRef, useState } from 'react'
import { formatWholeNumber } from '../../utils/number'
import { StatCard } from '../ui'
import UploadPublishTooltip, { type UploadHoverState } from '../charts/UploadPublishTooltip'
import './ContentInsightsCard.css'

type InsightVideo = {
  video_id: string
  title: string
  views: number
  thumbnail_url: string
}

export type ContentInsights = {
  total_videos: number
  in_period_views: number
  in_period_pct: number
  catalog_views: number
  catalog_pct: number
  in_period_videos: InsightVideo[]
  shortform_views: number
  shortform_pct: number
  longform_views: number
  longform_pct: number
  median_views: number
  mean_views: number
  p90_threshold: number
  outlier_count: number
  outlier_videos: InsightVideo[]
  outlier_share_pct: number
  videos_with_views: number
}

type ContentInsightsCardProps = {
  data: ContentInsights | null
  onOpenVideo?: (videoId: string) => void
}

function buildHoverState(
  anchor: HTMLElement,
  container: HTMLElement,
  videos: InsightVideo[],
  key: string,
): UploadHoverState {
  const containerRect = container.getBoundingClientRect()
  const rect = anchor.getBoundingClientRect()
  return {
    x: rect.left + rect.width / 2 - containerRect.left,
    y: rect.bottom - containerRect.top,
    items: [...videos].sort((a, b) => b.views - a.views).map((v) => ({
      video_id: v.video_id,
      title: v.title,
      published_at: '',
      thumbnail_url: v.thumbnail_url,
      content_type: '',
      detail: `${formatWholeNumber(v.views)} views`,
    })),
    key,
    startDate: '',
    endDate: '',
    dayCount: 0,
  }
}

function ContentInsightsCard({ data }: ContentInsightsCardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [hoverState, setHoverState] = useState<UploadHoverState | null>(null)
  const [tooltipTitle, setTooltipTitle] = useState('')
  const [tooltipStats, setTooltipStats] = useState<string[]>([])

  const cancelHide = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
  }

  const scheduleHide = () => {
    cancelHide()
    hideTimeoutRef.current = setTimeout(() => setHoverState(null), 150)
  }

  if (!data || data.total_videos === 0) {
    return (
      <div className="content-insights-card">
        <div className="content-insights-empty">No data for this period.</div>
      </div>
    )
  }

  const totalOutlierViews = data.outlier_videos.reduce((sum, v) => sum + v.views, 0)

  const handleInPeriodEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    cancelHide()
    const container = containerRef.current
    if (!container || data.in_period_videos.length === 0) return
    setTooltipTitle('New upload views')
    setTooltipStats([`${data.in_period_videos.length} videos uploaded in period`])
    setHoverState(buildHoverState(e.currentTarget, container, data.in_period_videos, 'in-period'))
  }

  const handleOutlierEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    cancelHide()
    const container = containerRef.current
    if (!container) return
    setTooltipTitle('Top performers')
    setTooltipStats([`${data.outlier_count} videos · \u2265${formatWholeNumber(data.p90_threshold)} views`])
    setHoverState(buildHoverState(e.currentTarget, container, data.outlier_videos, 'outliers'))
  }

  return (
    <div className="content-insights-card" ref={containerRef}>
      <div className="content-insights-body">
        <div className="content-insights-split-row">
          <StatCard
            label="New upload views"
            value={formatWholeNumber(data.in_period_views)}
            sub={`${data.in_period_pct}% of period views`}
            hoverable={data.in_period_videos.length > 0}
            onMouseEnter={data.in_period_videos.length > 0 ? handleInPeriodEnter : undefined}
            onMouseLeave={data.in_period_videos.length > 0 ? scheduleHide : undefined}
          />
          <StatCard
            label="Catalog views"
            value={formatWholeNumber(data.catalog_views)}
            sub={`${data.catalog_pct}% of period views`}
          />
        </div>

        <div className="content-insights-split-row">
          <StatCard
            label="Short-form views"
            value={formatWholeNumber(data.shortform_views)}
            sub={`${data.shortform_pct}% of period views`}
          />
          <StatCard
            label="Long-form views"
            value={formatWholeNumber(data.longform_views)}
            sub={`${data.longform_pct}% of period views`}
          />
        </div>

        <div className="content-insights-stats-grid">
          <StatCard label="Median views" value={formatWholeNumber(data.median_views)} />
          <StatCard label="Mean views" value={formatWholeNumber(Math.round(data.mean_views))} />
          <StatCard label="Top 10% share" value={`${data.outlier_share_pct}%`} />
          <StatCard label="Videos with views" value={formatWholeNumber(data.videos_with_views)} />
        </div>

        {data.outlier_videos.length > 0 && (
          <StatCard
            label="Top performers"
            value={formatWholeNumber(totalOutlierViews)}
            sub={`${data.outlier_count} videos · \u2265${formatWholeNumber(data.p90_threshold)} views`}
            hoverable
            onMouseEnter={handleOutlierEnter}
            onMouseLeave={scheduleHide}
          />
        )}
      </div>
      <UploadPublishTooltip
        hover={hoverState}
        onMouseEnter={cancelHide}
        onMouseLeave={scheduleHide}
        titleOverride={tooltipTitle}
        statsOverride={tooltipStats}
      />
    </div>
  )
}

export default ContentInsightsCard

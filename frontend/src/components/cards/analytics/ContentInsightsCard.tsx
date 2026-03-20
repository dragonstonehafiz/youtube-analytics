import { useRef, useState, useMemo, useEffect } from 'react'
import { formatWholeNumber } from '@utils/number'
import { StatCard } from '@components/ui'
import UploadPublishTooltip, { type UploadHoverState } from '@components/charts/UploadPublishTooltip'
import './ContentInsightsCard.css'

type InsightVideo = {
  video_id: string
  title: string
  views: number
  thumbnail_url: string
  content_type?: string
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
  shortform_video_count: number
  longform_video_count: number
  median_views: number
  mean_views: number
  p90_threshold: number
  outlier_count: number
  outlier_videos: InsightVideo[]
  outlier_share_pct: number
  videos_with_views: number
  all_views: number[]
  all_video_avg_view_durations: number[]
  all_videos: Array<{ video_id: string; title: string; thumbnail_url: string; avg_view_duration_seconds: number; view_percentage: number; content_type?: string }>
}

type ContentInsightsCardProps = {
  data: ContentInsights | null
  range?: { start: string; end: string }
  playlistId?: string
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
      content_type: v.content_type || '',
      detail: `${formatWholeNumber(v.views)} views`,
    })),
    key,
    startDate: '',
    endDate: '',
    dayCount: 0,
  }
}

function ContentInsightsCard({ data, range, playlistId }: ContentInsightsCardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [hoverState, setHoverState] = useState<UploadHoverState | null>(null)
  const [tooltipTitle, setTooltipTitle] = useState('')
  const [tooltipStats, setTooltipStats] = useState<string[]>([])
  const [previousData, setPreviousData] = useState<ContentInsights | null>(null)

  const previousRange = useMemo(() => {
    if (!range || !range.start || !range.end) return { start: '', end: '' }
    const start = new Date(range.start)
    const end = new Date(range.end)
    const daySpan = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000)
    const prevStart = new Date(prevEnd.getTime() - (daySpan - 1) * 24 * 60 * 60 * 1000)
    return {
      start: prevStart.toISOString().split('T')[0],
      end: prevEnd.toISOString().split('T')[0],
    }
  }, [range])

  useEffect(() => {
    async function loadPreviousData() {
      if (!previousRange.start || !previousRange.end) return
      try {
        const playlistParam = playlistId ? `&playlist_id=${playlistId}` : ''
        const response = await fetch(
          `http://localhost:8000/insights/content?start_date=${previousRange.start}&end_date=${previousRange.end}${playlistParam}`
        )
        const prevData = await response.json()
        setPreviousData(prevData)
      } catch {
        setPreviousData(null)
      }
    }
    loadPreviousData()
  }, [previousRange.start, previousRange.end, playlistId])

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

  const handleStdDevEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    cancelHide()
    const container = containerRef.current
    if (!container || !stats) return

    const mean = data.mean_views
    const stdDev = stats.stdDev
    const ratio = mean > 0 ? stdDev / mean : 0

    let explanation = ''
    if (ratio < 0.5) {
      explanation = 'Videos tend to cluster around the average. Performance is fairly consistent'
    } else if (ratio < 1.5) {
      explanation = 'Moderate variation. Some videos perform above average, others below'
    } else if (ratio < 3) {
      explanation = 'Wide range in performance. Some videos significantly exceed the average'
    } else {
      explanation = 'Very high variation. Performance spans a large range with notable outliers'
    }

    setTooltipTitle('Performance Variation')
    setTooltipStats([explanation])

    setHoverState({
      x: (e.currentTarget as HTMLDivElement).getBoundingClientRect().left +
         (e.currentTarget as HTMLDivElement).getBoundingClientRect().width / 2 -
         container.getBoundingClientRect().left,
      y: (e.currentTarget as HTMLDivElement).getBoundingClientRect().bottom -
         container.getBoundingClientRect().top,
      items: [],
      key: 'stddev',
      startDate: '',
      endDate: '',
      dayCount: 0,
    })
  }

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const stats = useMemo(() => {
    if (!data) return null

    const views = data.all_views
    const n = views.length
    const mean = data.mean_views

    let stdDev = 0
    if (n > 0) {
      const variance = views.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n
      stdDev = Math.sqrt(variance)
    }

    const maxViews = views.length > 0 ? Math.max(...views) : 0
    const maxViewIndex = views.length > 0 ? views.indexOf(maxViews) : -1
    const maxVideo = maxViewIndex >= 0 ? data.all_videos[maxViewIndex] : null

    const sorted = [...views].sort((a, b) => b - a)
    const topQuartileIndex = Math.ceil(n * 0.25)
    const top25Views = sorted.slice(0, topQuartileIndex).reduce((sum, v) => sum + v, 0)

    const currentTotalViews = data.in_period_views + data.catalog_views
    const previousTotalViews = previousData ? previousData.in_period_views + previousData.catalog_views : 0
    const growth = previousTotalViews > 0 ? ((currentTotalViews - previousTotalViews) / previousTotalViews) * 100 : 0

    return {
      stdDev: Math.round(stdDev),
      maxViews,
      maxVideo,
      top25Views,
      growth: Math.round(growth * 10) / 10,
    }
  }, [data, previousData])

  if (!data || data.total_videos === 0) {
    return (
      <div className="content-insights-card">
        <div className="content-insights-empty">No data for this period.</div>
      </div>
    )
  }

  const handleTop25Enter = (e: React.MouseEvent<HTMLDivElement>) => {
    cancelHide()
    const container = containerRef.current
    if (!container) return
    setTooltipTitle('Top 25% videos')
    setTooltipStats([`${formatWholeNumber(stats?.top25Views || 0)} views`])

    const viewsWithIndices = data.all_views.map((v, idx) => ({ views: v, idx }))
    const sorted = [...viewsWithIndices].sort((a, b) => b.views - a.views)
    const topQuartileIndex = Math.ceil(data.all_videos.length * 0.25)
    const topQuartile = sorted.slice(0, topQuartileIndex)

    const videoItems = topQuartile.map(item => ({
      video_id: data.all_videos[item.idx].video_id,
      title: data.all_videos[item.idx].title,
      views: item.views,
      thumbnail_url: data.all_videos[item.idx].thumbnail_url,
    }))

    setHoverState(buildHoverState(e.currentTarget, container, videoItems, 'top25'))
  }

  return (
    <div className="content-insights-card" ref={containerRef}>
      <h3 className="content-insights-card-title">Content Insights</h3>
      <div className="content-insights-body">
        <div className="content-insights-stats-grid">
          <StatCard label="Shortform uploads" value={String(data.shortform_video_count)} />
          <StatCard label="Longform uploads" value={String(data.longform_video_count)} />
          <StatCard label="View growth" value={`${stats?.growth ?? 0}%`} />
        </div>

        <div className="content-insights-stats-grid">
          <StatCard label="Median views" value={formatWholeNumber(data.median_views)} />
          <StatCard label="Mean views" value={formatWholeNumber(Math.round(data.mean_views))} />
          <StatCard
            label="Standard Deviation"
            value={formatWholeNumber(stats?.stdDev || 0)}
            hoverable
            onMouseEnter={handleStdDevEnter}
            onMouseLeave={scheduleHide}
          />
        </div>

        <div className="content-insights-stats-grid">
          {stats?.maxVideo && (
            <StatCard
              label="Highest views"
              value={formatWholeNumber(stats.maxViews)}
              hoverable
              onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => {
                cancelHide()
                const container = containerRef.current
                if (!container || !stats.maxVideo) return
                setTooltipTitle('Best performing video')
                setTooltipStats([stats.maxVideo.title])
                setHoverState(buildHoverState(e.currentTarget, container, [{ video_id: stats.maxVideo.video_id, title: stats.maxVideo.title, views: stats.maxViews, thumbnail_url: stats.maxVideo.thumbnail_url, content_type: stats.maxVideo.content_type }], 'max-video'))
              }}
              onMouseLeave={scheduleHide}
            />
          )}
          <StatCard
            label="Top 25% views"
            value={formatWholeNumber(stats?.top25Views || 0)}
            hoverable
            onMouseEnter={handleTop25Enter}
            onMouseLeave={scheduleHide}
          />
        </div>
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

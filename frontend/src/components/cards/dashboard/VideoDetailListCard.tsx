import { useMemo, useState } from 'react'
import { ActionButton, VideoThumbnail, TextLink } from '@components/ui'
import './VideoDetailListCard.css'

export type VideoDetailListItem = {
  video_id: string
  title: string
  thumbnail_url: string
  published_at: string
  views: number
  watch_time_minutes: number
  avg_view_duration_seconds: number
  avg_view_pct: number
}

type VideoDetailMetricKey = 'views' | 'watch_time' | 'avg_duration'

type VideoDetailListCardProps = {
  title: string
  items: VideoDetailListItem[]
  onOpenVideo: (videoId: string) => void
  emptyText?: string
  actionLabel?: string
  showTypicalRange?: boolean
  metrics?: VideoDetailMetricKey[]
}

type TypicalRange = {
  min: number
  max: number
  typicalStart: number
  typicalEnd: number
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatCompact(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
  return `${Math.round(value)}`
}

function formatWatchTimeHours(minutes: number): string {
  const hours = minutes / 60
  if (hours >= 1000) {
    return `${(hours / 1000).toFixed(1)}K`
  }
  if (hours >= 100) {
    return `${Math.round(hours)}`
  }
  return hours.toFixed(1)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) {
    return 0
  }
  const idx = (sortedValues.length - 1) * p
  const lower = Math.floor(idx)
  const upper = Math.ceil(idx)
  if (lower === upper) {
    return sortedValues[lower]
  }
  const weight = idx - lower
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight
}

function buildTypicalRange(values: number[]): TypicalRange {
  const filtered = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (filtered.length === 0) {
    return { min: 0, max: 1, typicalStart: 0, typicalEnd: 1 }
  }
  const min = filtered[0]
  let max = filtered[filtered.length - 1]
  if (max <= min) {
    max = min + 1
  }
  if (filtered.length < 4) {
    return { min, max, typicalStart: min, typicalEnd: max }
  }
  const typicalStart = percentile(filtered, 0.3)
  const typicalEnd = percentile(filtered, 0.7)
  return {
    min,
    max,
    typicalStart: clamp(typicalStart, min, max),
    typicalEnd: clamp(typicalEnd, min, max),
  }
}

function VideoDetailListCard({
  title,
  items,
  onOpenVideo,
  emptyText = 'No videos in this range.',
  actionLabel = 'See analytics',
  showTypicalRange = true,
  metrics = ['views', 'avg_duration'],
}: VideoDetailListCardProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  // Compute valid index: clamp to bounds and reset to 0 when items list shrinks significantly
  const effectiveIndex = useMemo(() => {
    if (items.length === 0) return 0
    // If activeIndex is out of bounds, clamp it
    if (activeIndex >= items.length) return Math.max(0, items.length - 1)
    return activeIndex
  }, [activeIndex, items.length])

  const activeItem = useMemo(() => items[effectiveIndex] ?? null, [items, effectiveIndex])
  const typicalRanges = useMemo(
    () => ({
      views: buildTypicalRange(items.map((item) => item.views)),
      watchTime: buildTypicalRange(items.map((item) => item.watch_time_minutes)),
      avgDuration: buildTypicalRange(items.map((item) => item.avg_view_duration_seconds)),
    }),
    [items]
  )

  const canPrevious = effectiveIndex > 0
  const canNext = effectiveIndex < items.length - 1

  return (
    <section className="video-detail-list-card">
      <h3 className="video-detail-list-title">{title}</h3>
      {activeItem ? (
        <>
          <div className="video-detail-list-thumb-wrap">
            <VideoThumbnail url={activeItem.thumbnail_url} title={activeItem.title} className="video-detail-list-thumb" />
            <div className="video-detail-list-thumb-title"><TextLink text={activeItem.title} to={`/videos/${activeItem.video_id}`} /></div>
          </div>
          <div className="video-detail-list-metrics">
            {[
              metrics.includes('views')
                ? {
                    key: 'views',
                    label: 'Views',
                    raw: activeItem.views,
                    valueText: activeItem.views.toLocaleString(),
                    range: typicalRanges.views,
                    tickFormatter: formatCompact,
                  }
                : null,
              metrics.includes('avg_duration')
                ? {
                    key: 'avgDuration',
                    label: 'Average view duration',
                    raw: activeItem.avg_view_duration_seconds,
                    valueText: formatDuration(activeItem.avg_view_duration_seconds),
                    range: typicalRanges.avgDuration,
                    tickFormatter: (value: number) => formatDuration(value),
                  }
                : null,
              metrics.includes('watch_time')
                ? {
                    key: 'watchTime',
                    label: 'Watch time (hours)',
                    raw: activeItem.watch_time_minutes,
                    valueText: formatWatchTimeHours(activeItem.watch_time_minutes),
                    range: typicalRanges.watchTime,
                    tickFormatter: (value: number) => formatWatchTimeHours(value),
                  }
                : null,
            ]
              .filter((metric): metric is NonNullable<typeof metric> => metric !== null)
              .map((metric) => {
                const startPct = ((metric.range.typicalStart - metric.range.min) / (metric.range.max - metric.range.min)) * 100
                const endPct = ((metric.range.typicalEnd - metric.range.min) / (metric.range.max - metric.range.min)) * 100
                const pointPct = ((metric.raw - metric.range.min) / (metric.range.max - metric.range.min)) * 100
                const trend = metric.raw > metric.range.typicalEnd ? 'up' : metric.raw < metric.range.typicalStart ? 'down' : 'within'
                return (
                  <div key={metric.key} className="video-detail-list-row">
                    <div className="video-detail-list-row-head">
                      <span>{metric.label}</span>
                      <strong className="video-detail-list-value">
                        {metric.valueText}
                        {showTypicalRange && trend !== 'within' ? <span className={`video-detail-list-trend video-detail-list-trend-${trend}`} /> : null}
                      </strong>
                    </div>
                    {showTypicalRange ? (
                      <>
                        <div className="video-detail-list-meter">
                          <div className="video-detail-list-meter-track" />
                          <div className="video-detail-list-meter-typical" style={{ left: `${startPct}%`, width: `${Math.max(2, endPct - startPct)}%` }} />
                          <span className="video-detail-list-meter-point" style={{ left: `${clamp(pointPct, 0, 100)}%` }} />
                        </div>
                        <div className="video-detail-list-meter-labels">
                          <span>{metric.tickFormatter(metric.range.typicalStart)}</span>
                          <span>Typical</span>
                          <span>{metric.tickFormatter(metric.range.typicalEnd)}</span>
                        </div>
                      </>
                    ) : null}
                  </div>
                )
              })}
          </div>
          <div className="video-detail-list-actions">
            <ActionButton label={actionLabel} variant="soft" className="video-detail-list-open" onClick={() => onOpenVideo(activeItem.video_id)} />
          </div>
          <div className="video-detail-list-footer">
            <button
              type="button"
              className="video-detail-list-nav"
              disabled={!canPrevious}
              onClick={() => setActiveIndex((prev) => Math.max(0, prev - 1))}
              aria-label="Previous"
            >
              {'<'}
            </button>
            <span className="video-detail-list-position">{`${effectiveIndex + 1} of ${items.length}`}</span>
            <button
              type="button"
              className="video-detail-list-nav"
              disabled={!canNext}
              onClick={() => setActiveIndex((prev) => Math.min(items.length - 1, prev + 1))}
              aria-label="Next"
            >
              {'>'}
            </button>
          </div>
        </>
      ) : (
        <div className="video-detail-list-empty">{emptyText}</div>
      )}
    </section>
  )
}

export default VideoDetailListCard

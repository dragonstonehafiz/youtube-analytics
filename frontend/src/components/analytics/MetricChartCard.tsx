import { useEffect, useMemo, useRef, useState } from 'react'
import './MetricChartCard.css'

type MetricKey = 'views' | 'watch_time' | 'subscribers' | 'revenue'

type MetricSummary = {
  key: MetricKey
  label: string
  value: string
  comparison?: {
    direction: 'up' | 'down' | 'flat'
    percentText: string
  }
}

type SeriesPoint = {
  date: string
  value: number
}

type PublishedItem = { title: string; published_at: string; thumbnail_url: string; content_type: string }
type BucketMeta = { startDate: string; endDate: string; dayCount: number }

type MetricChartCardProps = {
  metrics: MetricSummary[]
  series: Record<MetricKey, SeriesPoint[]>
  publishedDates?: Record<string, PublishedItem[]>
  publishedBucketMeta?: Record<string, BucketMeta>
}

type MarkerType = 'video' | 'short'

type ClusteredMarker = {
  x: number
  key: string
  items: PublishedItem[]
  markerType: MarkerType
  startDate: string
  endDate: string
  dayCount: number
}

function MetricChartCard({ metrics, series, publishedDates = {}, publishedBucketMeta = {} }: MetricChartCardProps) {
  const [activeMetric, setActiveMetric] = useState<MetricKey>('views')
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [hoverPublish, setHoverPublish] = useState<{
    x: number
    y: number
    items: PublishedItem[]
    key: string
    startDate: string
    endDate: string
    dayCount: number
  } | null>(null)
  const [hoverLocked, setHoverLocked] = useState(false)
  const hoverTimeoutRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [chartWidth, setChartWidth] = useState(960)

  const points = series[activeMetric] ?? []
  const chartHeight = 300
  const padding = { top: 12, right: 0, bottom: 48, left: 56 }
  const innerWidth = chartWidth - padding.left - padding.right
  const innerHeight = chartHeight - padding.top - padding.bottom

  useEffect(() => {
    if (!containerRef.current) {
      return
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const nextWidth = Math.max(320, Math.floor(entry.contentRect.width))
        setChartWidth(nextWidth)
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const { minValue, maxValue, ticks } = useMemo(() => {
    const values = points.map((point) => point.value)
    const min = values.length ? Math.min(...values) : 0
    const max = values.length ? Math.max(...values) : 1
    const paddedMax = max + (max - min) * 0.1 || 1
    const paddedMin = Math.max(0, min - (max - min) * 0.1)
    const tickCount = 4
    const step = (paddedMax - paddedMin) / tickCount
    const tickValues = Array.from({ length: tickCount + 1 }, (_, idx) => paddedMin + step * idx)
    return { minValue: paddedMin, maxValue: paddedMax, ticks: tickValues }
  }, [points])

  const xScale = (index: number) => {
    if (points.length <= 1) {
      return padding.left
    }
    return padding.left + (innerWidth * index) / (points.length - 1)
  }

  const yScale = (value: number) => {
    if (maxValue === minValue) {
      return padding.top + innerHeight / 2
    }
    const ratio = (value - minValue) / (maxValue - minValue)
    return padding.top + innerHeight - ratio * innerHeight
  }

  const linePath = useMemo(() => {
    if (!points.length) {
      return ''
    }
    return points
      .map((point, index) => {
        const x = xScale(index)
        const y = yScale(point.value)
        return `${index === 0 ? 'M' : 'L'}${x},${y}`
      })
      .join(' ')
  }, [points, maxValue, minValue])

  const areaPath = useMemo(() => {
    if (!linePath) {
      return ''
    }
    const lastIndex = points.length - 1
    const lastX = xScale(lastIndex)
    const baseY = padding.top + innerHeight
    return `${linePath} L${lastX},${baseY} L${xScale(0)},${baseY} Z`
  }, [linePath, points, maxValue, minValue])

  const activePoint = hoverIndex !== null ? points[hoverIndex] : null
  const activeX = hoverIndex !== null ? xScale(hoverIndex) : null
  const activeY = hoverIndex !== null && activePoint ? yScale(activePoint.value) : null
  const labelStep = Math.max(1, Math.ceil(points.length / 8))
  const publishPoints = points
    .map((point, index) => ({
      index,
      date: point.date,
      items: publishedDates[point.date] ?? [],
      meta: publishedBucketMeta[point.date] ?? { startDate: point.date, endDate: point.date, dayCount: 1 },
    }))
    .filter((item) => item.items.length > 0)

  const clusteredPublish = useMemo<ClusteredMarker[]>(() => {
    if (innerWidth <= 0) {
      return []
    }
    const bucketCount = 24
    const bucketWidth = innerWidth / bucketCount
    const mixedMarkerOffset = Math.min(14, Math.max(9, Math.floor(bucketWidth * 0.28)))
    const buckets = new Map<
      number,
      { x: number; key: string; videoItems: PublishedItem[]; shortItems: PublishedItem[]; startDate: string; endDate: string; dayCount: number }
    >()
    publishPoints.forEach((item) => {
      const x = xScale(item.index)
      const bucket = Math.min(bucketCount - 1, Math.max(0, Math.floor((x - padding.left) / bucketWidth)))
      const existing = buckets.get(bucket)
      if (!existing) {
        buckets.set(bucket, {
          x: padding.left + bucket * bucketWidth + bucketWidth / 2,
          key: item.date,
          videoItems: [],
          shortItems: [],
          startDate: item.meta.startDate,
          endDate: item.meta.endDate,
          dayCount: item.meta.dayCount,
        })
      } else {
        existing.key = `${existing.key}|${item.date}`
        if (item.meta.startDate < existing.startDate) {
          existing.startDate = item.meta.startDate
        }
        if (item.meta.endDate > existing.endDate) {
          existing.endDate = item.meta.endDate
        }
        existing.dayCount += item.meta.dayCount
      }
      const target = buckets.get(bucket)
      if (!target) {
        return
      }
      item.items.forEach((published) => {
        if ((published.content_type || '').toLowerCase() === 'short') {
          target.shortItems.push(published)
        } else {
          target.videoItems.push(published)
        }
      })
    })
    const markers: ClusteredMarker[] = []
    buckets.forEach((bucket) => {
      const hasVideo = bucket.videoItems.length > 0
      const hasShort = bucket.shortItems.length > 0
      if (!hasVideo && !hasShort) {
        return
      }
      if (hasVideo && hasShort) {
        markers.push({
          x: bucket.x - mixedMarkerOffset,
          key: `${bucket.key}|short`,
          items: bucket.shortItems,
          markerType: 'short',
          startDate: bucket.startDate,
          endDate: bucket.endDate,
          dayCount: bucket.dayCount,
        })
        markers.push({
          x: bucket.x + mixedMarkerOffset,
          key: `${bucket.key}|video`,
          items: bucket.videoItems,
          markerType: 'video',
          startDate: bucket.startDate,
          endDate: bucket.endDate,
          dayCount: bucket.dayCount,
        })
      } else {
        markers.push({
          x: bucket.x,
          key: `${bucket.key}|${hasShort ? 'short' : 'video'}`,
          items: hasShort ? bucket.shortItems : bucket.videoItems,
          markerType: hasShort ? 'short' : 'video',
          startDate: bucket.startDate,
          endDate: bucket.endDate,
          dayCount: bucket.dayCount,
        })
      }
    })
    return markers.sort((a, b) => a.x - b.x)
  }, [publishPoints, innerWidth, padding.left])

  const handlePointerMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!points.length) {
      return
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - bounds.left
    const clamped = Math.min(Math.max(x - padding.left, 0), innerWidth)
    const ratio = innerWidth === 0 ? 0 : clamped / innerWidth
    const index = Math.round(ratio * (points.length - 1))
    setHoverIndex(index)
  }

  const handlePointerLeave = () => {
    setHoverIndex(null)
  }

  return (
    <div className="metric-chart-card" ref={containerRef}>
      <div className="metric-row">
        {metrics.map((metric) => (
          <button
            key={metric.key}
            className={metric.key === activeMetric ? 'metric-chip active' : 'metric-chip'}
            type="button"
            onClick={() => setActiveMetric(metric.key)}
          >
            <span className="metric-label">{metric.label}</span>
            <span className="metric-value-row">
              <span className="metric-value">{metric.value}</span>
              {metric.comparison ? (
                <span
                  className={`metric-trend-icon metric-trend-${metric.comparison.direction}`}
                  aria-hidden="true"
                />
              ) : null}
            </span>
            {metric.comparison ? <span className="metric-comparison">{metric.comparison.percentText}</span> : null}
          </button>
        ))}
      </div>
      <div className="chart-wrap">
        <svg
          width="100%"
          height={chartHeight}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          preserveAspectRatio="none"
          onMouseMove={handlePointerMove}
          onMouseLeave={handlePointerLeave}
        >
          <defs>
            <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={padding.left} x2={chartWidth - padding.right} y1={yScale(tick)} y2={yScale(tick)} stroke="#e2e8f0" />
              <text
                x={padding.left - 10}
                y={yScale(tick) + 4}
                fontSize="11"
                fill="#64748b"
                textAnchor="end"
              >
                {Math.round(tick).toLocaleString()}
              </text>
            </g>
          ))}
          {areaPath ? <path d={areaPath} fill="url(#areaFill)" /> : null}
          {linePath ? <path d={linePath} fill="none" stroke="#0ea5e9" strokeWidth="2" /> : null}
          {activePoint && activeX !== null && activeY !== null ? (
            <g>
              <line
                x1={activeX}
                x2={activeX}
                y1={padding.top}
                y2={padding.top + innerHeight}
                stroke="#94a3b8"
                strokeDasharray="4 4"
              />
              <circle cx={activeX} cy={activeY} r="4" fill="#0ea5e9" />
            </g>
          ) : null}
          {points.map((point, index) => {
            if (index % labelStep !== 0 && index !== points.length - 1) {
              return null
            }
            return (
              <text
                key={`label-${point.date}-${index}`}
                x={xScale(index)}
                y={chartHeight - 26}
                fontSize="11"
                fill="#64748b"
                textAnchor="middle"
              >
                {point.date}
              </text>
            )
          })}
          {clusteredPublish.map((item, index) => {
            const markerY = chartHeight - 12
            return (
              <g
                key={`publish-${index}`}
                className={hoverPublish?.key === item.key ? 'publish-group active' : 'publish-group'}
                onMouseEnter={() =>
                  setHoverPublish({
                    x: item.x,
                    y: chartHeight - 12,
                    items: item.items,
                    key: item.key,
                    startDate: item.startDate,
                    endDate: item.endDate,
                    dayCount: item.dayCount,
                  })
                }
                onMouseLeave={() => {
                  if (hoverTimeoutRef.current) {
                    window.clearTimeout(hoverTimeoutRef.current)
                  }
                  hoverTimeoutRef.current = window.setTimeout(() => {
                    if (!hoverLocked) {
                      setHoverPublish(null)
                    }
                  }, 150)
                }}
              >
                <circle cx={item.x} cy={chartHeight - 12} r={9} className="publish-hit" />
                <circle
                  cx={item.x}
                  cy={chartHeight - 12}
                  r={8}
                  className={`publish-icon ${item.markerType === 'short' ? 'publish-icon-short' : ''}`}
                />
                {item.items.length > 1 ? (
                  <text
                    x={item.x}
                    y={chartHeight - 8}
                    textAnchor="middle"
                    fontSize="10"
                    className="publish-count"
                  >
                    {item.items.length}
                  </text>
                ) : (
                  <polygon
                    className="publish-play"
                    points={`${item.x - 2.8},${markerY - 4.2} ${item.x - 2.8},${markerY + 4.2} ${item.x + 3.8},${markerY}`}
                  />
                )}
              </g>
            )
          })}
        </svg>
        {activePoint && activeX !== null && activeY !== null ? (
          <div
            className="chart-tooltip"
            style={{ left: activeX, top: activeY }}
          >
            <div className="tooltip-date">{activePoint.date}</div>
            <div className="tooltip-value">{activePoint.value.toLocaleString()}</div>
          </div>
        ) : null}
        {hoverPublish ? (
          <div
            className="chart-tooltip publish-tooltip"
            style={{ left: hoverPublish.x, top: hoverPublish.y + 18 }}
            onMouseEnter={() => {
              if (hoverTimeoutRef.current) {
                window.clearTimeout(hoverTimeoutRef.current)
              }
              setHoverLocked(true)
            }}
            onMouseLeave={() => {
              setHoverLocked(false)
              if (hoverTimeoutRef.current) {
                window.clearTimeout(hoverTimeoutRef.current)
              }
              hoverTimeoutRef.current = window.setTimeout(() => setHoverPublish(null), 150)
            }}
          >
            <div className="tooltip-date">{hoverPublish.startDate} to {hoverPublish.endDate}</div>
            <div className="tooltip-date">
              {hoverPublish.dayCount} {hoverPublish.dayCount === 1 ? 'day' : 'days'}
            </div>
            <div className="tooltip-date">
              {hoverPublish.items.length} {hoverPublish.items.length === 1 ? 'video' : 'videos'} published
            </div>
            <ul>
              {hoverPublish.items.map((item, index) => (
                <li key={`${item.title}-${index}`} className="publish-item">
                  {item.thumbnail_url ? (
                    <img className="publish-thumb" src={item.thumbnail_url} alt={item.title} />
                  ) : (
                    <div className="publish-thumb" />
                  )}
                  <div>
                    <div className="publish-title">{item.title}</div>
                    <div className="publish-date">{item.published_at?.split('T')[0] || ''}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default MetricChartCard

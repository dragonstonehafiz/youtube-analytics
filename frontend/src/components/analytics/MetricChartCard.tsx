import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDecimalNumber, formatWholeNumber } from '../../utils/number'
import UploadPublishMarkers, { type ClusteredPublishMarker } from './UploadPublishMarkers'
import UploadPublishTooltip, { type UploadHoverState } from './UploadPublishTooltip'
import './MetricChartCard.css'

type MetricSummary = {
  key: string
  label: string
  value: string
}

type SeriesPoint = {
  date: string
  value: number
}

type MultiSeries = {
  key: string
  label: string
  color: string
  points: SeriesPoint[]
}

type PublishedItem = { title: string; published_at: string; thumbnail_url: string; content_type: string }
type BucketMeta = { startDate: string; endDate: string; dayCount: number }

type MetricChartCardProps = {
  metrics: MetricSummary[]
  series?: Record<string, SeriesPoint[]>
  previousSeries?: Record<string, SeriesPoint[]>
  multiSeriesByMetric?: Record<string, MultiSeries[]>
  previousMultiSeriesByMetric?: Record<string, MultiSeries[]>
  comparisonAggregation?: Record<string, 'sum' | 'avg'>
  activeMetricKey?: string
  onActiveMetricChange?: (key: string) => void
  startDate?: string
  endDate?: string
  useRangeAsDailyAxis?: boolean
  publishedDates?: Record<string, PublishedItem[]>
  publishedBucketMeta?: Record<string, BucketMeta>
}

const DECIMAL_METRICS = new Set(['revenue', 'estimated_revenue', 'cpm', 'rpm', 'playback_based_cpm'])

function MetricChartCard({
  metrics,
  series = {},
  previousSeries = {},
  multiSeriesByMetric = {},
  previousMultiSeriesByMetric = {},
  comparisonAggregation = {},
  activeMetricKey,
  onActiveMetricChange,
  startDate,
  endDate,
  useRangeAsDailyAxis = false,
  publishedDates = {},
  publishedBucketMeta = {},
}: MetricChartCardProps) {
  const [activeMetric, setActiveMetric] = useState<string>(activeMetricKey ?? metrics[0]?.key ?? '')
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [hoverPublish, setHoverPublish] = useState<UploadHoverState | null>(null)
  const [hoverLocked, setHoverLocked] = useState(false)
  const hoverTimeoutRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [chartWidth, setChartWidth] = useState(960)

  const points = series[activeMetric] ?? []
  const activeMultiSeries = multiSeriesByMetric[activeMetric] ?? []
  const isMulti = activeMultiSeries.length > 0
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

  useEffect(() => {
    if (activeMetricKey && metrics.some((metric) => metric.key === activeMetricKey) && activeMetric !== activeMetricKey) {
      setActiveMetric(activeMetricKey)
      return
    }
    if (!metrics.some((metric) => metric.key === activeMetric)) {
      setActiveMetric(activeMetricKey && metrics.some((metric) => metric.key === activeMetricKey) ? activeMetricKey : (metrics[0]?.key ?? ''))
    }
  }, [metrics, activeMetric, activeMetricKey])

  const dates = useMemo(() => {
    if (useRangeAsDailyAxis && startDate && endDate) {
      const start = new Date(`${startDate}T00:00:00Z`)
      const end = new Date(`${endDate}T00:00:00Z`)
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end) {
        const days: string[] = []
        const cursor = new Date(start)
        while (cursor <= end) {
          days.push(cursor.toISOString().slice(0, 10))
          cursor.setUTCDate(cursor.getUTCDate() + 1)
        }
        return days
      }
    }
    if (isMulti) {
      const allDates = new Set<string>()
      activeMultiSeries.forEach((line) => {
        line.points.forEach((point) => allDates.add(point.date))
      })
      return Array.from(allDates).sort((a, b) => a.localeCompare(b))
    }
    return points.map((point) => point.date)
  }, [useRangeAsDailyAxis, startDate, endDate, isMulti, activeMultiSeries, points])

  const singleByDate = useMemo(() => {
    const map = new Map<string, number>()
    points.forEach((point) => map.set(point.date, point.value))
    return map
  }, [points])

  const valueByMultiSeries = useMemo(() => {
    const map = new Map<string, Map<string, number>>()
    activeMultiSeries.forEach((line) => {
      const byDate = new Map<string, number>()
      line.points.forEach((point) => byDate.set(point.date, point.value))
      map.set(line.key, byDate)
    })
    return map
  }, [activeMultiSeries])

  const displayDates = useMemo(() => {
    if (!isMulti || dates.length === 0) {
      return dates
    }
    let first = -1
    let last = -1
    for (let i = 0; i < dates.length; i += 1) {
      const day = dates[i]
      const hasValue = activeMultiSeries.some((line) => (valueByMultiSeries.get(line.key)?.get(day) ?? 0) > 0)
      if (hasValue) {
        first = i
        break
      }
    }
    for (let i = dates.length - 1; i >= 0; i -= 1) {
      const day = dates[i]
      const hasValue = activeMultiSeries.some((line) => (valueByMultiSeries.get(line.key)?.get(day) ?? 0) > 0)
      if (hasValue) {
        last = i
        break
      }
    }
    if (first === -1 || last === -1 || first > last) {
      return dates
    }
    return dates.slice(first, last + 1)
  }, [isMulti, dates, activeMultiSeries, valueByMultiSeries])

  const { minValue, maxValue, ticks } = useMemo(() => {
    const values = isMulti
      ? activeMultiSeries.flatMap((line) => line.points.map((point) => point.value))
      : points.map((point) => point.value)
    const min = values.length ? Math.min(...values) : 0
    const max = values.length ? Math.max(...values) : 1
    const paddedMax = max + (max - min) * 0.1 || 1
    const paddedMin = Math.max(0, min - (max - min) * 0.1)
    const tickCount = 4
    const step = (paddedMax - paddedMin) / tickCount
    const tickValues = Array.from({ length: tickCount + 1 }, (_, idx) => paddedMin + step * idx)
    return { minValue: paddedMin, maxValue: paddedMax, ticks: tickValues }
  }, [isMulti, activeMultiSeries, points])

  const xScale = (index: number) => {
    if (displayDates.length <= 1) {
      return padding.left
    }
    return padding.left + (innerWidth * index) / (displayDates.length - 1)
  }

  const yScale = (value: number) => {
    if (maxValue === minValue) {
      return padding.top + innerHeight / 2
    }
    const ratio = (value - minValue) / (maxValue - minValue)
    return padding.top + innerHeight - ratio * innerHeight
  }

  const linePath = useMemo(() => {
    if (isMulti || !displayDates.length) {
      return ''
    }
    return displayDates
      .map((day, index) => {
        const x = xScale(index)
        const y = yScale(singleByDate.get(day) ?? 0)
        return `${index === 0 ? 'M' : 'L'}${x},${y}`
      })
      .join(' ')
  }, [isMulti, displayDates, singleByDate, maxValue, minValue, innerWidth, innerHeight, padding.left, padding.top])

  const areaPath = useMemo(() => {
    if (!linePath || isMulti) {
      return ''
    }
    const lastIndex = displayDates.length - 1
    const lastX = xScale(lastIndex)
    const baseY = padding.top + innerHeight
    return `${linePath} L${lastX},${baseY} L${xScale(0)},${baseY} Z`
  }, [linePath, isMulti, displayDates, maxValue, minValue, innerWidth, innerHeight, padding.left, padding.top])

  const multiLinePaths = useMemo(() => {
    if (!isMulti) {
      return [] as Array<{ key: string; color: string; path: string }>
    }
    return activeMultiSeries.map((line) => {
      const byDate = valueByMultiSeries.get(line.key) ?? new Map<string, number>()
      const path = displayDates
        .map((day, index) => {
          const x = xScale(index)
          const y = yScale(byDate.get(day) ?? 0)
          return `${index === 0 ? 'M' : 'L'}${x},${y}`
        })
        .join(' ')
      return { key: line.key, color: line.color, path }
    })
  }, [isMulti, activeMultiSeries, valueByMultiSeries, displayDates, maxValue, minValue, innerWidth, innerHeight])

  const activeDay = hoverIndex !== null && hoverIndex >= 0 && hoverIndex < displayDates.length ? displayDates[hoverIndex] : null
  const activeValue = activeDay ? singleByDate.get(activeDay) ?? 0 : null
  const activeX = hoverIndex !== null && hoverIndex >= 0 && hoverIndex < displayDates.length ? xScale(hoverIndex) : null
  const activeY = activeValue !== null && activeX !== null ? yScale(activeValue) : null
  const labelStep = Math.max(1, Math.ceil(displayDates.length / 8))
  const publishPoints = displayDates
    .map((point, index) => ({
      index,
      date: point,
      items: publishedDates[point] ?? [],
      meta: publishedBucketMeta[point] ?? { startDate: point, endDate: point, dayCount: 1 },
    }))
    .filter((item) => item.items.length > 0)

  const clusteredPublish = useMemo<ClusteredPublishMarker[]>(() => {
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
    const markers: ClusteredPublishMarker[] = []
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
    if (!displayDates.length) {
      return
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - bounds.left
    const clamped = Math.min(Math.max(x - padding.left, 0), innerWidth)
    const ratio = innerWidth === 0 ? 0 : clamped / innerWidth
    const index = Math.round(ratio * (displayDates.length - 1))
    setHoverIndex(index)
  }

  const handlePointerLeave = () => {
    setHoverIndex(null)
  }

  const formatChartValue = (value: number) => {
    if (activeMetric === 'avg_duration') {
      return `${formatDecimalNumber(value / 60)} min`
    }
    return DECIMAL_METRICS.has(activeMetric) ? formatDecimalNumber(value) : formatWholeNumber(Math.round(value))
  }

  const previousWindowLabel = useMemo(() => {
    if (!startDate || !endDate) {
      return 'previous period'
    }
    const start = new Date(`${startDate}T00:00:00Z`)
    const end = new Date(`${endDate}T00:00:00Z`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return 'previous period'
    }
    const daySpan = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1)
    return `previous ${daySpan === 1 ? '1 day' : `${daySpan} days`}`
  }, [startDate, endDate])

  const computeComparison = (metricKey: string) => {
    const aggregation = comparisonAggregation[metricKey] ?? 'sum'
    const currentMulti = multiSeriesByMetric[metricKey] ?? []
    const previousMulti = previousMultiSeriesByMetric[metricKey] ?? []
    const currentSingle = series[metricKey] ?? []
    const previousSingle = previousSeries[metricKey] ?? []
    const getSingleValue = (points: SeriesPoint[]) => {
      if (points.length === 0) {
        return 0
      }
      if (aggregation === 'avg') {
        return points.reduce((sum, point) => sum + point.value, 0) / points.length
      }
      return points.reduce((sum, point) => sum + point.value, 0)
    }
    const getMultiValue = (lines: MultiSeries[]) => {
      const values = lines.flatMap((line) => line.points.map((point) => point.value))
      if (values.length === 0) {
        return 0
      }
      if (aggregation === 'avg') {
        return values.reduce((sum, value) => sum + value, 0) / values.length
      }
      return values.reduce((sum, value) => sum + value, 0)
    }
    const currentValue = currentMulti.length > 0 ? getMultiValue(currentMulti) : getSingleValue(currentSingle)
    const previousValue = previousMulti.length > 0 ? getMultiValue(previousMulti) : getSingleValue(previousSingle)
    const hasCurrentData = currentMulti.length > 0 || currentSingle.length > 0
    const hasPreviousData = previousMulti.length > 0 || previousSingle.length > 0
    if (!hasCurrentData && !hasPreviousData) {
      return undefined
    }
    const label = previousWindowLabel
    const rawDelta = currentValue - previousValue
    if (rawDelta === 0) {
      return { direction: 'flat', percentText: `No change vs ${label}` }
    }
    const base = previousValue === 0 ? 1 : Math.abs(previousValue)
    const percent = Math.abs((rawDelta / base) * 100)
    return {
      direction: rawDelta > 0 ? 'up' : 'down',
      percentText: `${percent.toFixed(1)}% ${rawDelta > 0 ? 'more' : 'less'} than ${label}`,
    }
  }

  return (
    <div className="metric-chart-card" ref={containerRef}>
      <div className="metric-row">
        {metrics.map((metric) => {
          const comparison = computeComparison(metric.key)
          return (
            <button
              key={metric.key}
              className={metric.key === activeMetric ? 'metric-chip active' : 'metric-chip'}
              type="button"
              onClick={() => {
                setActiveMetric(metric.key)
                onActiveMetricChange?.(metric.key)
              }}
            >
              <span className="metric-label">{metric.label}</span>
              <span className="metric-value-row">
                <span className="metric-value">{metric.value}</span>
                {comparison ? (
                  <span
                    className={`metric-trend-icon metric-trend-${comparison.direction}`}
                    aria-hidden="true"
                  />
                ) : null}
              </span>
              {comparison ? <span className="metric-comparison">{comparison.percentText}</span> : null}
            </button>
          )
        })}
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
                {formatChartValue(tick)}
              </text>
            </g>
          ))}
          {areaPath ? <path d={areaPath} fill="url(#areaFill)" /> : null}
          {linePath ? <path d={linePath} fill="none" stroke="#0ea5e9" strokeWidth="2" /> : null}
          {multiLinePaths.map((line) => (
            <path key={line.key} d={line.path} fill="none" stroke={line.color} strokeWidth="2" opacity="0.9" />
          ))}
          {!isMulti && activeDay && activeX !== null && activeY !== null ? (
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
          {displayDates.map((day, index) => {
            if (index % labelStep !== 0 && index !== displayDates.length - 1) {
              return null
            }
            return (
              <text
                key={`label-${day}-${index}`}
                x={xScale(index)}
                y={chartHeight - 26}
                fontSize="11"
                fill="#64748b"
                textAnchor="middle"
              >
                {day}
              </text>
            )
          })}
          <UploadPublishMarkers
            markers={clusteredPublish}
            chartHeight={chartHeight}
            activeKey={hoverPublish?.key ?? null}
            onMarkerEnter={(marker, y) => {
              setHoverPublish({
                x: marker.x,
                y,
                items: marker.items,
                key: marker.key,
                startDate: marker.startDate,
                endDate: marker.endDate,
                dayCount: marker.dayCount,
              })
            }}
            onMarkerLeave={() => {
              if (hoverTimeoutRef.current) {
                window.clearTimeout(hoverTimeoutRef.current)
              }
              hoverTimeoutRef.current = window.setTimeout(() => {
                if (!hoverLocked) {
                  setHoverPublish(null)
                }
              }, 150)
            }}
          />
        </svg>
        {!isMulti && activeDay && activeX !== null && activeY !== null ? (
          <div
            className="chart-tooltip"
            style={{ left: activeX, top: activeY }}
          >
            <div className="tooltip-date">{activeDay}</div>
            <div className="tooltip-value">{formatChartValue(activeValue ?? 0)}</div>
          </div>
        ) : null}
        {isMulti && activeDay && activeX !== null ? (
          <div className="chart-tooltip multiline-tooltip" style={{ left: activeX, top: padding.top + 12 }}>
            <div className="tooltip-date">{activeDay}</div>
            {activeMultiSeries.map((line) => {
              const value = valueByMultiSeries.get(line.key)?.get(activeDay) ?? 0
              return (
                <div key={`tooltip-${line.key}`} className="multiline-tooltip-row">
                  <span className="multiline-legend-dot" style={{ background: line.color }} />
                  <span className="multiline-tooltip-label">{line.label}</span>
                  <span className="multiline-tooltip-value">{formatChartValue(value)}</span>
                </div>
              )
            })}
          </div>
        ) : null}
        <UploadPublishTooltip
          hover={hoverPublish}
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
        />
      </div>
    </div>
  )
}

export default MetricChartCard

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDecimalNumber, formatWholeNumber } from '../../utils/number'
import { useHideMonetaryValues } from '../../hooks/usePrivacyMode'
import UploadPublishMarkers, { type ClusteredPublishMarker } from './UploadPublishMarkers'
import UploadPublishTooltip, { type UploadHoverState, type UploadPublishTooltipItem } from './UploadPublishTooltip'
import './MetricChartCard.css'

export type Granularity = 'daily' | '7d' | '28d' | '90d' | 'monthly' | 'yearly'

export type SeriesPoint = {
  date: string
  value: number
}

export type LineSeries = {
  key: string
  label: string
  color: string
  points: SeriesPoint[]
}

export type MetricItem = {
  key: string
  label: string
  value: string
  series?: LineSeries[]
  previousSeries?: LineSeries[]
  comparisonAggregation?: 'sum' | 'avg'
  seriesAggregation?: 'sum' | 'avg' | 'last'
  isDuration?: boolean
  spikeRegions?: SpikeRegion[]
}

export type SpikeRegion = {
  start_date: string
  end_date: string
  items: UploadPublishTooltipItem[]
  onMouseEnter: (x: number, y: number) => void
  onMouseLeave: () => void
}

export type SpikeContributor = { date: string; video_id: string; title: string; thumbnail_url: string; content_type: string; views: number }

type BucketMeta = { startDate: string; endDate: string; dayCount: number }

type AggregatedSeries = {
  points: SeriesPoint[]
  rawDays: string[]
  bucketMeta: Record<string, BucketMeta>
  dayToBucket: Map<string, string>
}

type AggregatedMultiSeries = {
  lines: LineSeries[]
  rawDays: string[]
  bucketMeta: Record<string, BucketMeta>
  dayToBucket: Map<string, string>
}

type MetricChartCardProps = {
  data: MetricItem[]
  granularity: Granularity
  publishedDates?: Record<string, PublishedItem[]>
  showYearMarkers?: boolean
}

const DECIMAL_METRICS = new Set(['revenue', 'estimated_revenue', 'cpm', 'rpm', 'playback_based_cpm'])

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function buildContinuousDays(startDay: string, endDay: string): string[] {
  const start = new Date(`${startDay}T00:00:00Z`)
  const end = new Date(`${endDay}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return []
  }
  const days: string[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

function aggregateFilledSeries(
  rawPoints: SeriesPoint[],
  granularity: Granularity,
  aggregation: 'sum' | 'avg' | 'last'
): AggregatedSeries {
  const groupedRaw = new Map<string, number>()
  rawPoints.forEach((point) => {
    if (!isIsoDate(point.date)) {
      return
    }
    groupedRaw.set(point.date, (groupedRaw.get(point.date) ?? 0) + (Number.isFinite(point.value) ? point.value : 0))
  })

  const sortedDays = Array.from(groupedRaw.keys()).sort((a, b) => a.localeCompare(b))
  if (sortedDays.length === 0) {
    return { points: [], rawDays: [], bucketMeta: {}, dayToBucket: new Map() }
  }

  const rawDays = buildContinuousDays(sortedDays[0], sortedDays[sortedDays.length - 1])
  const rawFilled = rawDays.map((day) => ({ date: day, value: groupedRaw.get(day) ?? 0 }))

  const dayToBucket = new Map<string, string>()
  const bucketMeta: Record<string, BucketMeta> = {}

  if (granularity === 'daily') {
    rawFilled.forEach((point) => {
      dayToBucket.set(point.date, point.date)
      bucketMeta[point.date] = { startDate: point.date, endDate: point.date, dayCount: 1 }
    })
    return { points: rawFilled, rawDays, bucketMeta, dayToBucket }
  }

  if (granularity === 'monthly' || granularity === 'yearly') {
    const buckets = new Map<string, { sum: number; count: number; lastValue: number; startDate: string; endDate: string; dayCount: number }>()
    rawFilled.forEach((point) => {
      const bucketKey = granularity === 'monthly' ? point.date.slice(0, 7) : `${point.date.slice(0, 4)}-01-01`
      dayToBucket.set(point.date, bucketKey)
      const existing = buckets.get(bucketKey)
      if (!existing) {
        buckets.set(bucketKey, {
          sum: point.value,
          count: 1,
          lastValue: point.value,
          startDate: point.date,
          endDate: point.date,
          dayCount: 1,
        })
      } else {
        existing.sum += point.value
        existing.count += 1
        existing.lastValue = point.value
        existing.endDate = point.date
        existing.dayCount += 1
      }
    })

    const points = Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, bucket]) => {
        bucketMeta[key] = {
          startDate: bucket.startDate,
          endDate: bucket.endDate,
          dayCount: bucket.dayCount,
        }
        const value = aggregation === 'last' ? bucket.lastValue : aggregation === 'avg' ? bucket.sum / bucket.count : bucket.sum
        return { date: key, value }
      })
    return { points, rawDays, bucketMeta, dayToBucket }
  }

  const windowSize = granularity === '7d' ? 7 : granularity === '28d' ? 28 : 90
  const points: SeriesPoint[] = []
  for (let index = 0; index < rawFilled.length; index += windowSize) {
    const bucket = rawFilled.slice(index, index + windowSize)
    if (bucket.length === 0) {
      continue
    }
    const bucketKey = bucket[bucket.length - 1].date
    bucket.forEach((point) => dayToBucket.set(point.date, bucketKey))
    bucketMeta[bucketKey] = {
      startDate: bucket[0].date,
      endDate: bucket[bucket.length - 1].date,
      dayCount: bucket.length,
    }
    const sum = bucket.reduce((acc, point) => acc + point.value, 0)
    const lastValue = bucket[bucket.length - 1].value
    const value = aggregation === 'last' ? lastValue : aggregation === 'avg' ? sum / bucket.length : sum
    points.push({ date: bucketKey, value })
  }

  return { points, rawDays, bucketMeta, dayToBucket }
}

function aggregateFilledMultiSeries(
  rawLines: LineSeries[],
  granularity: Granularity,
  aggregation: 'sum' | 'avg' | 'last'
): AggregatedMultiSeries {
  const allDays = new Set<string>()
  const byLine = new Map<string, Map<string, number>>()

  rawLines.forEach((line) => {
    const lineDays = new Map<string, number>()
    line.points.forEach((point) => {
      if (!isIsoDate(point.date)) {
        return
      }
      allDays.add(point.date)
      lineDays.set(point.date, (lineDays.get(point.date) ?? 0) + (Number.isFinite(point.value) ? point.value : 0))
    })
    byLine.set(line.key, lineDays)
  })

  const sortedDays = Array.from(allDays).sort((a, b) => a.localeCompare(b))
  if (sortedDays.length === 0) {
    return { lines: [], rawDays: [], bucketMeta: {}, dayToBucket: new Map() }
  }

  const rawDays = buildContinuousDays(sortedDays[0], sortedDays[sortedDays.length - 1])
  const rawFilledByLine = rawLines.map((line) => ({
    ...line,
    points: rawDays.map((day) => ({ date: day, value: byLine.get(line.key)?.get(day) ?? 0 })),
  }))

  const sample = aggregateFilledSeries(rawFilledByLine[0]?.points ?? [], granularity, aggregation)
  const lines = rawFilledByLine.map((line) => {
    const aggregated = aggregateFilledSeries(line.points, granularity, aggregation)
    return {
      key: line.key,
      label: line.label,
      color: line.color,
      points: aggregated.points,
    }
  })

  return {
    lines,
    rawDays,
    bucketMeta: sample.bucketMeta,
    dayToBucket: sample.dayToBucket,
  }
}

function MetricChartCard({
  data,
  granularity,
  publishedDates = {},
  showYearMarkers = true,
}: MetricChartCardProps) {
  const metrics = data.map(m => ({ key: m.key, label: m.label, value: m.value }))
  const seriesByMetric: Record<string, LineSeries[]> = {}
  const previousSeriesByMetric: Record<string, LineSeries[]> = {}
  const comparisonAggregation: Record<string, 'sum' | 'avg'> = {}
  const seriesAggregation: Record<string, 'sum' | 'avg' | 'last'> = {}
  const durationMetrics: string[] = []

  data.forEach(metric => {
    if (metric.series) seriesByMetric[metric.key] = metric.series
    if (metric.previousSeries) previousSeriesByMetric[metric.key] = metric.previousSeries
    if (metric.comparisonAggregation) comparisonAggregation[metric.key] = metric.comparisonAggregation
    if (metric.seriesAggregation) seriesAggregation[metric.key] = metric.seriesAggregation
    if (metric.isDuration) durationMetrics.push(metric.key)
  })

  const hideMonetaryValues = useHideMonetaryValues()
  const [activeMetric, setActiveMetric] = useState<string>(metrics[0]?.key ?? '')
  const spikeRegions = data.find(m => m.key === activeMetric)?.spikeRegions ?? []
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [hoverPublish, setHoverPublish] = useState<UploadHoverState | null>(null)
  const [hoverLocked, setHoverLocked] = useState(false)
  const hoverTimeoutRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartWrapRef = useRef<HTMLDivElement | null>(null)
  const [chartWidth, setChartWidth] = useState(960)

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
    if (!metrics.some((metric) => metric.key === activeMetric)) {
      setActiveMetric(metrics[0]?.key ?? '')
    }
  }, [metrics, activeMetric])

  const aggregatedByMetric = useMemo(() => {
    const next: Record<string, AggregatedMultiSeries> = {}
    const keys = new Set<string>([...Object.keys(seriesByMetric), ...Object.keys(previousSeriesByMetric), ...metrics.map((metric) => metric.key)])
    keys.forEach((key) => {
      const aggregation = (seriesAggregation?.[key] ?? 'sum') as 'sum' | 'avg' | 'last'
      next[key] = aggregateFilledMultiSeries(seriesByMetric[key] ?? [], granularity, aggregation)
    })
    return next
  }, [seriesByMetric, previousSeriesByMetric, metrics, granularity, seriesAggregation])

  const previousAggregatedByMetric = useMemo(() => {
    const next: Record<string, AggregatedMultiSeries> = {}
    const keys = new Set<string>([...Object.keys(seriesByMetric), ...Object.keys(previousSeriesByMetric), ...metrics.map((metric) => metric.key)])
    keys.forEach((key) => {
      const aggregation = (seriesAggregation?.[key] ?? comparisonAggregation[key] ?? 'sum') as 'sum' | 'avg' | 'last'
      next[key] = aggregateFilledMultiSeries(previousSeriesByMetric[key] ?? [], granularity, aggregation)
    })
    return next
  }, [seriesByMetric, previousSeriesByMetric, metrics, granularity, comparisonAggregation, seriesAggregation])

  const activeLines = aggregatedByMetric[activeMetric]?.lines ?? []
  const isMulti = activeLines.length > 1
  const points = activeLines[0]?.points ?? []
  const singleLineColor = activeLines[0]?.color ?? '#0ea5e9'
  const chartData = aggregatedByMetric[activeMetric]
  const chartRawDays = chartData?.rawDays ?? []
  const chartDayToBucket = chartData?.dayToBucket ?? new Map<string, string>()
  const chartBucketMeta = chartData?.bucketMeta ?? {}

  const chartHeight = 350
  const padding = { top: 12, right: 0, bottom: 48, left: 56 }
  const innerWidth = chartWidth - padding.left - padding.right
  const innerHeight = chartHeight - padding.top - padding.bottom

  const dates = useMemo(() => {
    if (isMulti) {
      const allDates = new Set<string>()
      activeLines.forEach((line) => {
        line.points.forEach((point) => allDates.add(point.date))
      })
      return Array.from(allDates).sort((a, b) => a.localeCompare(b))
    }
    return points.map((point) => point.date)
  }, [isMulti, activeLines, points])

  const singleByDate = useMemo(() => {
    const map = new Map<string, number>()
    points.forEach((point) => map.set(point.date, point.value))
    return map
  }, [points])

  const valueByLine = useMemo(() => {
    const map = new Map<string, Map<string, number>>()
    activeLines.forEach((line) => {
      const byDate = new Map<string, number>()
      line.points.forEach((point) => byDate.set(point.date, point.value))
      map.set(line.key, byDate)
    })
    return map
  }, [activeLines])

  const displayDates = useMemo(() => {
    if (!isMulti || dates.length === 0) {
      return dates
    }
    let first = -1
    let last = -1
    for (let i = 0; i < dates.length; i += 1) {
      const day = dates[i]
      const hasValue = activeLines.some((line) => (valueByLine.get(line.key)?.get(day) ?? 0) > 0)
      if (hasValue) {
        first = i
        break
      }
    }
    for (let i = dates.length - 1; i >= 0; i -= 1) {
      const day = dates[i]
      const hasValue = activeLines.some((line) => (valueByLine.get(line.key)?.get(day) ?? 0) > 0)
      if (hasValue) {
        last = i
        break
      }
    }
    if (first === -1 || last === -1 || first > last) {
      return dates
    }
    return dates.slice(first, last + 1)
  }, [isMulti, dates, activeLines, valueByLine])

  const { minValue, maxValue, ticks } = useMemo(() => {
    const values = isMulti
      ? activeLines.flatMap((line) => line.points.map((point) => point.value))
      : points.map((point) => point.value)
    const min = values.length ? Math.min(...values) : 0
    const max = values.length ? Math.max(...values) : 1
    const paddedMax = max + (max - min) * 0.1 || 1
    const paddedMin = min - (max - min) * 0.1
    const tickCount = 4
    const step = (paddedMax - paddedMin) / tickCount
    const tickValues = Array.from({ length: tickCount + 1 }, (_, idx) => paddedMin + step * idx)

    // Always include 0 if data spans negative and positive values
    if (paddedMin < 0 && paddedMax > 0 && !tickValues.some(t => Math.abs(t) < 0.01)) {
      tickValues.push(0)
      tickValues.sort((a, b) => a - b)
    }

    return { minValue: paddedMin, maxValue: paddedMax, ticks: tickValues }
  }, [isMulti, activeLines, points])

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
    return activeLines.map((line) => {
      const byDate = valueByLine.get(line.key) ?? new Map<string, number>()
      const path = displayDates
        .map((day, index) => {
          const x = xScale(index)
          const y = yScale(byDate.get(day) ?? 0)
          return `${index === 0 ? 'M' : 'L'}${x},${y}`
        })
        .join(' ')
      return { key: line.key, color: line.color, path }
    })
  }, [isMulti, activeLines, valueByLine, displayDates, maxValue, minValue, innerWidth, innerHeight])

  const activeDay = hoverIndex !== null && hoverIndex >= 0 && hoverIndex < displayDates.length ? displayDates[hoverIndex] : null
  const activeValue = activeDay ? singleByDate.get(activeDay) ?? 0 : null
  const activeX = hoverIndex !== null && hoverIndex >= 0 && hoverIndex < displayDates.length ? xScale(hoverIndex) : null
  const activeY = activeValue !== null && activeX !== null ? yScale(activeValue) : null
  const labelStep = Math.max(1, Math.ceil(displayDates.length / 8))

  const yearMarkers = useMemo(() => {
    if (!showYearMarkers || displayDates.length === 0) return []
    const markers: Array<{ index: number; year: string }> = []
    for (let i = 1; i < displayDates.length; i++) {
      const prevYear = displayDates[i - 1].slice(0, 4)
      const currYear = displayDates[i].slice(0, 4)
      if (currYear !== prevYear) {
        markers.push({ index: i, year: currYear })
      }
    }
    return markers
  }, [showYearMarkers, displayDates])

  const computedSpikeRects = useMemo(() => {
    if (!spikeRegions.length || displayDates.length === 0) return []

    // Map region dates to displayDate indices
    return spikeRegions.map((region) => {
      const startIndex = (() => {
        let closest = 0
        for (let i = 0; i < displayDates.length; i++) {
          if (displayDates[i] >= region.start_date) return i
          closest = i
        }
        return closest
      })()
      const endIndex = (() => {
        for (let i = displayDates.length - 1; i >= 0; i--) {
          if (displayDates[i] <= region.end_date) return i
        }
        return 0
      })()
      const minEndIndex = Math.max(endIndex, Math.min(startIndex + 1, displayDates.length - 1))
      const x1 = xScale(startIndex)
      const x2 = xScale(minEndIndex)
      const centerX = (x1 + x2) / 2
      return { region, x1, x2, centerX }
    })
  }, [spikeRegions, displayDates, xScale])

  const rebucketedPublished = useMemo(() => {
    const rebucketed: Record<string, PublishedItem[]> = {}
    if (chartDayToBucket.size === 0) {
      return rebucketed
    }
    Object.entries(publishedDates).forEach(([day, dayItems]) => {
      const bucket = chartDayToBucket.get(day)
      if (!bucket) {
        return
      }
      if (!rebucketed[bucket]) {
        rebucketed[bucket] = []
      }
      rebucketed[bucket].push(...dayItems)
    })
    return rebucketed
  }, [publishedDates, chartDayToBucket])

  const publishPoints = displayDates
    .map((point, index) => ({
      index,
      date: point,
      items: rebucketedPublished[point] ?? [],
      meta: chartBucketMeta[point] ?? { startDate: point, endDate: point, dayCount: 1 },
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
    if (hideMonetaryValues && DECIMAL_METRICS.has(activeMetric)) {
      return '••••••'
    }
    if (activeMetric === 'avg_duration' || durationMetrics.includes(activeMetric)) {
      const secs = Math.round(value)
      return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
    }
    return DECIMAL_METRICS.has(activeMetric) ? formatDecimalNumber(value) : formatWholeNumber(Math.round(value))
  }

  const previousWindowLabel = useMemo(() => {
    const daySpan = Math.max(1, chartRawDays.length)
    return `previous ${daySpan === 1 ? '1 day' : `${daySpan} days`}`
  }, [chartRawDays.length])

  const computeComparison = (metricKey: string) => {
    const aggregation = seriesAggregation?.[metricKey] ?? comparisonAggregation[metricKey] ?? 'sum'
    const currentLines = aggregatedByMetric[metricKey]?.lines ?? []
    const previousLines = previousAggregatedByMetric[metricKey]?.lines ?? []

    const getValue = (lines: LineSeries[]) => {
      const values = lines.flatMap((line) => line.points.map((point) => point.value))
      if (values.length === 0) return 0
      if (aggregation === 'last') return values.length > 0 ? values[values.length - 1] : 0
      if (aggregation === 'avg') return values.reduce((sum, value) => sum + value, 0) / values.length
      return values.reduce((sum, value) => sum + value, 0)
    }

    const currentValue = getValue(currentLines)
    const previousValue = getValue(previousLines)
    const hasCurrentData = currentLines.length > 0
    const hasPreviousData = previousLines.length > 0
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

  const clamp = (value: number, minValue: number, maxValue: number): number => {
    if (maxValue < minValue) {
      return minValue
    }
    return Math.min(Math.max(value, minValue), maxValue)
  }

  const getTooltipPosition = (
    anchorX: number,
    anchorY: number,
    tooltipWidth: number,
    tooltipHeight: number,
    preferAbove: boolean
  ) => {
    const viewportMargin = 8
    const gap = 10
    const wrapRect = chartWrapRef.current?.getBoundingClientRect()
    const wrapTop = wrapRect?.top ?? 0
    const wrapLeft = wrapRect?.left ?? 0
    const viewportWidth = typeof window === 'undefined' ? chartWidth : window.innerWidth
    const viewportHeight = typeof window === 'undefined' ? chartHeight : window.innerHeight

    const minLeftFromWrap = viewportMargin - wrapLeft
    const maxLeftFromWrap = viewportWidth - viewportMargin - wrapLeft - tooltipWidth
    let left = clamp(anchorX - tooltipWidth / 2, minLeftFromWrap, maxLeftFromWrap)

    const belowTop = anchorY + gap
    const aboveTop = anchorY - tooltipHeight - gap
    let top = preferAbove ? aboveTop : belowTop

    const belowBottomViewport = wrapTop + belowTop + tooltipHeight
    const aboveTopViewport = wrapTop + aboveTop
    if (preferAbove && aboveTopViewport < viewportMargin) {
      top = belowTop
    } else if (!preferAbove && belowBottomViewport > viewportHeight - viewportMargin) {
      top = aboveTop
    }

    const minTopFromWrap = viewportMargin - wrapTop
    const maxTopFromWrap = viewportHeight - viewportMargin - wrapTop - tooltipHeight
    top = clamp(top, minTopFromWrap, maxTopFromWrap)
    return { left, top }
  }

  const singleTooltipPosition = useMemo(() => {
    if (isMulti || activeX === null || activeY === null) {
      return null
    }
    return getTooltipPosition(activeX, activeY, 160, 54, true)
  }, [isMulti, activeX, activeY, chartWidth, chartHeight])

  const multiTooltipPosition = useMemo(() => {
    if (!isMulti || activeX === null) {
      return null
    }
    const estimatedHeight = 34 + activeLines.length * 26
    return getTooltipPosition(activeX, padding.top + 12, 300, estimatedHeight, false)
  }, [isMulti, activeX, activeLines.length, padding.top, chartWidth, chartHeight])

  return (
    <div className="metric-chart-card" ref={containerRef}>
      <div className="metric-row">
        {metrics.map((metric) => {
          const comparison = computeComparison(metric.key)
          const displayValue = hideMonetaryValues && DECIMAL_METRICS.has(metric.key) ? '••••••' : metric.value
          return (
            <button
              key={metric.key}
              className={metric.key === activeMetric ? 'metric-chip active' : 'metric-chip'}
              type="button"
              onClick={() => {
                setActiveMetric(metric.key)
              }}
            >
              <span className="metric-label">{metric.label}</span>
              <span className="metric-value-row">
                <span className="metric-value">{displayValue}</span>
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
      <div className="chart-wrap" ref={chartWrapRef}>
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
              <stop offset="0%" stopColor={singleLineColor} stopOpacity="0.2" />
              <stop offset="100%" stopColor={singleLineColor} stopOpacity="0.02" />
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
          {yearMarkers.map(({ index, year }) => {
            const x = xScale(index)
            return (
              <g key={`year-${year}`}>
                <line
                  x1={x} x2={x}
                  y1={padding.top} y2={padding.top + innerHeight}
                  stroke="#94a3b8"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={x + 4}
                  y={padding.top + 12}
                  fontSize="11"
                  fill="#94a3b8"
                  fontWeight="600"
                >
                  {year}
                </text>
              </g>
            )
          })}
          {areaPath ? <path d={areaPath} fill="url(#areaFill)" /> : null}
          {linePath ? <path d={linePath} fill="none" stroke={singleLineColor} strokeWidth="2" /> : null}
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
              <circle cx={activeX} cy={activeY} r="4" fill={singleLineColor} />
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
          {computedSpikeRects.map(({ region, x1, x2, centerX }) => (
            <rect
              key={`spike-${region.start_date}-${region.end_date}`}
              x={x1}
              y={padding.top}
              width={Math.max(x2 - x1, 2)}
              height={innerHeight}
              fill="rgba(251, 146, 60, 0.12)"
              stroke="rgba(251, 146, 60, 0.35)"
              strokeWidth="1"
              style={{ cursor: 'default', pointerEvents: 'auto' }}
              onMouseEnter={() => {
                const wrapEl = chartWrapRef.current
                region.onMouseEnter(centerX + (wrapEl?.offsetLeft ?? 0), padding.top + innerHeight + (wrapEl?.offsetTop ?? 0))
              }}
              onMouseLeave={() => region.onMouseLeave()}
            />
          ))}
        </svg>
        {!isMulti && activeDay && activeX !== null && activeY !== null ? (
          <div
            className="chart-tooltip tooltip-clamped"
            style={{
              left: singleTooltipPosition?.left ?? activeX,
              top: singleTooltipPosition?.top ?? activeY,
            }}
          >
            <div className="tooltip-date">{activeDay}</div>
            <div className="tooltip-value">{formatChartValue(activeValue ?? 0)}</div>
          </div>
        ) : null}
        {isMulti && activeDay && activeX !== null ? (
          <div
            className="chart-tooltip multiline-tooltip tooltip-clamped"
            style={{
              left: multiTooltipPosition?.left ?? activeX,
              top: multiTooltipPosition?.top ?? padding.top + 12,
            }}
          >
            <div className="tooltip-date">{activeDay}</div>
            {activeLines.map((line) => {
              const value = valueByLine.get(line.key)?.get(activeDay) ?? 0
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

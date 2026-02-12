import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DateRangePicker, Dropdown } from '../components/ui'
import {
  MetricChartCard,
  MonetizationContentPerformanceCard,
  MonetizationEarningsCard,
  TopContentTable,
  VideoDetailListCard,
} from '../components/analytics'
import { PageCard } from '../components/layout'
import { formatDisplayDate } from '../utils/date'
import { formatCurrency, formatWholeNumber } from '../utils/number'
import { getStored, setStored } from '../utils/storage'
import './Page.css'

type Granularity = 'daily' | '7d' | '28d' | '90d' | 'monthly' | 'yearly'

type SeriesPoint = { date: string; value: number }
type BucketMeta = { startDate: string; endDate: string; dayCount: number }
type MetricKey = 'views' | 'watch_time' | 'subscribers' | 'revenue'
type TotalsState = {
  views: number
  watch_time_minutes: number
  subscribers_net: number
  estimated_revenue: number
}
type MetricComparison = {
  direction: 'up' | 'down' | 'flat'
  percentText: string
}
type LatestContentItem = {
  video_id: string
  title: string
  thumbnail_url: string
  published_at: string
  views: number
  watch_time_minutes: number
  avg_view_duration_seconds: number
  avg_view_pct: number
}
type AnalyticsTab = 'metrics' | 'monetization'
type MonetizationTotalsState = {
  estimated_revenue: number
  ad_impressions: number
  monetized_playbacks: number
  cpm: number
}
type MonetizationComparisonState = Partial<
  Record<'estimated_revenue' | 'ad_impressions' | 'monetized_playbacks' | 'cpm', MetricComparison>
>
type MonetizationContentType = 'video' | 'short'
type MonetizationMonthly = {
  monthKey: string
  label: string
  amount: number
}
type MonetizationTopItem = {
  video_id: string
  title: string
  thumbnail_url: string
  revenue: number
}
type MonetizationPerformance = {
  views: number
  estimated_revenue: number
  rpm: number
  items: MonetizationTopItem[]
}

function buildDayBucketMap(days: string[], granularity: Granularity): Map<string, string> {
  const dayToBucket = new Map<string, string>()
  if (granularity === 'daily') {
    days.forEach((day) => dayToBucket.set(day, day))
    return dayToBucket
  }
  if (granularity === 'monthly') {
    days.forEach((day) => dayToBucket.set(day, day.slice(0, 7)))
    return dayToBucket
  }
  if (granularity === 'yearly') {
    days.forEach((day) => dayToBucket.set(day, `${day.slice(0, 4)}-01-01`))
    return dayToBucket
  }

  const windowSize = granularity === '7d' ? 7 : granularity === '28d' ? 28 : 90
  for (let index = 0; index < days.length; index += windowSize) {
    const bucket = days.slice(index, index + windowSize)
    if (bucket.length === 0) {
      continue
    }
    const bucketKey = bucket[bucket.length - 1]
    bucket.forEach((day) => dayToBucket.set(day, bucketKey))
  }
  return dayToBucket
}

function buildBucketMeta(days: string[], granularity: Granularity): Record<string, BucketMeta> {
  const meta: Record<string, BucketMeta> = {}
  if (days.length === 0) {
    return meta
  }
  if (granularity === 'daily') {
    days.forEach((day) => {
      meta[day] = { startDate: day, endDate: day, dayCount: 1 }
    })
    return meta
  }
  if (granularity === 'monthly') {
    const groups = new Map<string, { startDate: string; endDate: string; dayCount: number }>()
    days.forEach((day) => {
      const key = day.slice(0, 7)
      const existing = groups.get(key)
      if (!existing) {
        groups.set(key, { startDate: day, endDate: day, dayCount: 1 })
      } else {
        existing.endDate = day
        existing.dayCount += 1
      }
    })
    groups.forEach((value, key) => {
      meta[key] = value
    })
    return meta
  }
  if (granularity === 'yearly') {
    const groups = new Map<string, { startDate: string; endDate: string; dayCount: number }>()
    days.forEach((day) => {
      const key = `${day.slice(0, 4)}-01-01`
      const existing = groups.get(key)
      if (!existing) {
        groups.set(key, { startDate: day, endDate: day, dayCount: 1 })
      } else {
        existing.endDate = day
        existing.dayCount += 1
      }
    })
    groups.forEach((value, key) => {
      meta[key] = value
    })
    return meta
  }
  const windowSize = granularity === '7d' ? 7 : granularity === '28d' ? 28 : 90
  for (let index = 0; index < days.length; index += windowSize) {
    const bucket = days.slice(index, index + windowSize)
    if (bucket.length === 0) {
      continue
    }
    const key = bucket[bucket.length - 1]
    meta[key] = { startDate: bucket[0], endDate: bucket[bucket.length - 1], dayCount: bucket.length }
  }
  return meta
}

function aggregatePoints(points: SeriesPoint[], granularity: Granularity): SeriesPoint[] {
  if (granularity === 'daily' || points.length === 0) {
    return points
  }

  if (granularity === 'monthly' || granularity === 'yearly') {
    const grouped = new Map<string, { value: number; lastDate: string }>()
    points.forEach((point) => {
      const key = granularity === 'monthly' ? point.date.slice(0, 7) : point.date.slice(0, 4)
      const existing = grouped.get(key)
      if (existing) {
        existing.value += point.value
        existing.lastDate = point.date
      } else {
        grouped.set(key, { value: point.value, lastDate: point.date })
      }
    })
    return Array.from(grouped.entries()).map(([key, group]) => ({
      date: granularity === 'monthly' ? key : `${key}-01-01`,
      value: group.value,
    }))
  }

  const windowSize = granularity === '7d' ? 7 : granularity === '28d' ? 28 : 90
  const aggregated: SeriesPoint[] = []
  for (let index = 0; index < points.length; index += windowSize) {
    const bucket = points.slice(index, index + windowSize)
    aggregated.push({
      date: bucket[bucket.length - 1].date,
      value: bucket.reduce((sum, item) => sum + item.value, 0),
    })
  }
  return aggregated
}

function aggregateWeightedPoints(
  points: SeriesPoint[],
  weights: SeriesPoint[],
  granularity: Granularity
): SeriesPoint[] {
  if (granularity === 'daily' || points.length === 0) {
    return points
  }

  const weightByDate = new Map(weights.map((point) => [point.date, point.value]))

  if (granularity === 'monthly' || granularity === 'yearly') {
    const grouped = new Map<string, { value: number; weight: number; lastDate: string; fallbackSum: number; fallbackCount: number }>()
    points.forEach((point) => {
      const key = granularity === 'monthly' ? point.date.slice(0, 7) : point.date.slice(0, 4)
      const weight = weightByDate.get(point.date) ?? 0
      const existing = grouped.get(key)
      if (existing) {
        existing.value += point.value * weight
        existing.weight += weight
        existing.fallbackSum += point.value
        existing.fallbackCount += 1
        existing.lastDate = point.date
      } else {
        grouped.set(key, {
          value: point.value * weight,
          weight,
          lastDate: point.date,
          fallbackSum: point.value,
          fallbackCount: 1,
        })
      }
    })
    return Array.from(grouped.entries()).map(([key, group]) => ({
      date: granularity === 'monthly' ? key : `${key}-01-01`,
      value: group.weight > 0 ? group.value / group.weight : group.fallbackSum / group.fallbackCount,
    }))
  }

  const windowSize = granularity === '7d' ? 7 : granularity === '28d' ? 28 : 90
  const aggregated: SeriesPoint[] = []
  for (let index = 0; index < points.length; index += windowSize) {
    const bucket = points.slice(index, index + windowSize)
    let weightedSum = 0
    let weightSum = 0
    let fallbackSum = 0
    bucket.forEach((item) => {
      const weight = weightByDate.get(item.date) ?? 0
      weightedSum += item.value * weight
      weightSum += weight
      fallbackSum += item.value
    })
    aggregated.push({
      date: bucket[bucket.length - 1].date,
      value: weightSum > 0 ? weightedSum / weightSum : fallbackSum / bucket.length,
    })
  }
  return aggregated
}

function Analytics() {
  const navigate = useNavigate()
  const [years, setYears] = useState<string[]>([])
  const rangeOptions = [
    { label: 'Last 7 days', value: 'range:7d' },
    { label: 'Last 28 days', value: 'range:28d' },
    { label: 'Last 365 days', value: 'range:365d' },
    { label: 'Full data', value: 'full' },
  ]
  const storedRange = getStored('analyticsRange', null as {
    mode?: 'presets' | 'year' | 'custom'
    presetSelection?: string
    yearSelection?: string
    monthSelection?: string
    customStart?: string
    customEnd?: string
  } | null)
  const [mode, setMode] = useState<'presets' | 'year' | 'custom'>(storedRange?.mode ?? 'presets')
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>(getStored('analyticsTab', 'metrics'))
  const [presetSelection, setPresetSelection] = useState(storedRange?.presetSelection ?? 'range:28d')
  const [yearSelection, setYearSelection] = useState(storedRange?.yearSelection ?? '')
  const [monthSelection, setMonthSelection] = useState(storedRange?.monthSelection ?? 'all')
  const [contentSelection, setContentSelection] = useState(getStored('analyticsContentSelection', 'all'))
  const [granularity, setGranularity] = useState<Granularity>(getStored('analyticsGranularity', 'daily'))
  const today = new Date().toISOString().slice(0, 10)
  const [customStart, setCustomStart] = useState(storedRange?.customStart ?? today)
  const [customEnd, setCustomEnd] = useState(storedRange?.customEnd ?? today)
  const [series, setSeries] = useState<Record<string, SeriesPoint[]>>({})
  const [summaryDays, setSummaryDays] = useState<string[]>([])
  const [publishedDates, setPublishedDates] = useState<Record<string, { title: string; published_at: string; thumbnail_url: string; content_type: string }[]>>({})
  const [publishBucketMeta, setPublishBucketMeta] = useState<Record<string, BucketMeta>>({})
  const [totals, setTotals] = useState<TotalsState>({
    views: 0,
    watch_time_minutes: 0,
    subscribers_net: 0,
    estimated_revenue: 0,
  })
  const [comparisons, setComparisons] = useState<Partial<Record<MetricKey, MetricComparison>>>({})
  const [monetizationComparisons, setMonetizationComparisons] = useState<MonetizationComparisonState>({})
  const [latestLongform, setLatestLongform] = useState<LatestContentItem[]>([])
  const [latestShorts, setLatestShorts] = useState<LatestContentItem[]>([])
  const [topContent, setTopContent] = useState<
    {
      video_id: string
      rank: number
      title: string
      published_at: string
      upload_date: string
      thumbnail_url: string
      avg_view_duration: string
      avg_view_pct: string
      views: string
    }[]
  >([])
  const [monetizationTotals, setMonetizationTotals] = useState<MonetizationTotalsState>({
    estimated_revenue: 0,
    ad_impressions: 0,
    monetized_playbacks: 0,
    cpm: 0,
  })
  const [monetizationContentType, setMonetizationContentType] = useState<MonetizationContentType>('video')
  const [monthlyEarnings, setMonthlyEarnings] = useState<MonetizationMonthly[]>([])
  const [contentPerformance, setContentPerformance] = useState<Record<MonetizationContentType, MonetizationPerformance>>({
    video: { views: 0, estimated_revenue: 0, rpm: 0, items: [] },
    short: { views: 0, estimated_revenue: 0, rpm: 0, items: [] },
  })
  const [monetizationSeries, setMonetizationSeries] = useState<Record<string, SeriesPoint[]>>({
    estimated_revenue: [],
    ad_impressions: [],
    monetized_playbacks: [],
    cpm: [],
  })

  const range = useMemo(() => {
    const now = new Date()
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    const format = (value: Date) => value.toISOString().slice(0, 10)
    if (mode === 'presets') {
      if (presetSelection.startsWith('range:')) {
        const days = parseInt(presetSelection.split(':')[1].replace('d', ''), 10)
        const start = new Date(today)
        start.setUTCDate(start.getUTCDate() - (days - 1))
        return { start: format(start), end: format(today) }
      }
      if (presetSelection === 'full') {
        if (years.length > 0) {
          const parsed = years.map((value) => parseInt(value, 10)).filter((value) => !Number.isNaN(value))
          const minYear = Math.min(...parsed)
          const maxYear = Math.max(...parsed)
          return { start: `${minYear}-01-01`, end: `${maxYear}-12-31` }
        }
        return { start: format(today), end: format(today) }
      }
    }
    if (mode === 'year' && yearSelection) {
      const year = parseInt(yearSelection, 10)
      if (!Number.isNaN(year)) {
        if (monthSelection === 'all') {
          return { start: `${year}-01-01`, end: `${year}-12-31` }
        }
        const month = parseInt(monthSelection, 10)
        if (!Number.isNaN(month)) {
          const start = new Date(Date.UTC(year, month - 1, 1))
          const end = new Date(Date.UTC(year, month, 0))
          return { start: format(start), end: format(end) }
        }
        return { start: `${year}-01-01`, end: `${year}-12-31` }
      }
    }
    if (mode === 'custom') {
      return { start: customStart, end: customEnd }
    }
    return { start: format(today), end: format(today) }
  }, [mode, presetSelection, yearSelection, monthSelection, customStart, customEnd, years])

  const previousRange = useMemo(() => {
    const start = new Date(`${range.start}T00:00:00Z`)
    const end = new Date(`${range.end}T00:00:00Z`)
    const daySpan = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1)
    const previousEnd = new Date(start)
    previousEnd.setUTCDate(previousEnd.getUTCDate() - 1)
    const previousStart = new Date(previousEnd)
    previousStart.setUTCDate(previousStart.getUTCDate() - (daySpan - 1))
    return {
      start: previousStart.toISOString().slice(0, 10),
      end: previousEnd.toISOString().slice(0, 10),
      daySpan,
    }
  }, [range.start, range.end])

  const buildComparison = (currentValue: number, previousValue: number, windowLabel: string): MetricComparison => {
    const rawDelta = currentValue - previousValue
    if (rawDelta === 0) {
      return { direction: 'flat', percentText: `No change vs previous ${windowLabel}` }
    }
    const base = previousValue === 0 ? 1 : Math.abs(previousValue)
    const percent = Math.abs((rawDelta / base) * 100)
    return {
      direction: rawDelta > 0 ? 'up' : 'down',
      percentText: `${percent.toFixed(1)}% ${rawDelta > 0 ? 'more' : 'less'} than previous ${windowLabel}`,
    }
  }
  useEffect(() => {
    async function loadYears() {
      try {
        const response = await fetch('http://127.0.0.1:8000/analytics/years')
        const data = await response.json()
        if (Array.isArray(data.years) && data.years.length > 0) {
          setYears(data.years)
          setYearSelection((prev) => (prev ? prev : data.years[0]))
        }
      } catch (error) {
        console.error('Failed to load years', error)
      }
    }

    loadYears()
  }, [])

  useEffect(() => {
    if (mode === 'year' && !yearSelection && years.length > 0) {
      setYearSelection(years[0])
    }
  }, [mode, yearSelection, years])

  useEffect(() => {
    setStored('analyticsRange', {
      mode,
      presetSelection,
      yearSelection,
      monthSelection,
      customStart,
      customEnd,
    })
  }, [mode, presetSelection, yearSelection, monthSelection, customStart, customEnd])

  useEffect(() => {
    setStored('analyticsContentSelection', contentSelection)
  }, [contentSelection])

  useEffect(() => {
    setStored('analyticsGranularity', granularity)
  }, [granularity])

  useEffect(() => {
    setStored('analyticsTab', analyticsTab)
  }, [analyticsTab])

  useEffect(() => {
    async function loadSummary() {
      try {
        const buildSummaryUrl = (start: string, end: string) =>
          contentSelection === 'all'
            ? `http://127.0.0.1:8000/analytics/channel-daily?start_date=${start}&end_date=${end}`
            : `http://127.0.0.1:8000/analytics/daily/summary?start_date=${start}&end_date=${end}&content_type=${contentSelection}`
        const [currentResponse, previousResponse] = await Promise.all([
          fetch(buildSummaryUrl(range.start, range.end)),
          fetch(buildSummaryUrl(previousRange.start, previousRange.end)),
        ])
        const [data, previousData] = await Promise.all([currentResponse.json(), previousResponse.json()])
        const items = Array.isArray(data.items) ? data.items : []
        const gained = data.totals?.subscribers_gained ?? 0
        const lost = data.totals?.subscribers_lost ?? 0
        const nextTotals: TotalsState = {
          views: data.totals?.views ?? 0,
          watch_time_minutes: data.totals?.watch_time_minutes ?? 0,
          subscribers_net: gained - lost,
          estimated_revenue: data.totals?.estimated_revenue ?? 0,
        }
        setTotals(nextTotals)
        const previousGained = previousData.totals?.subscribers_gained ?? 0
        const previousLost = previousData.totals?.subscribers_lost ?? 0
        const previousTotals: TotalsState = {
          views: previousData.totals?.views ?? 0,
          watch_time_minutes: previousData.totals?.watch_time_minutes ?? 0,
          subscribers_net: previousGained - previousLost,
          estimated_revenue: previousData.totals?.estimated_revenue ?? 0,
        }
        const windowLabel = previousRange.daySpan === 1 ? '1 day' : `${previousRange.daySpan} days`
        const buildComparison = (currentValue: number, previousValue: number): MetricComparison => {
          const rawDelta = currentValue - previousValue
          if (rawDelta === 0) {
            return { direction: 'flat', percentText: `No change vs previous ${windowLabel}` }
          }
          const base = previousValue === 0 ? 1 : Math.abs(previousValue)
          const percent = Math.abs((rawDelta / base) * 100)
          return {
            direction: rawDelta > 0 ? 'up' : 'down',
            percentText: `${percent.toFixed(1)}% ${rawDelta > 0 ? 'more' : 'less'} than previous ${windowLabel}`,
          }
        }
        setComparisons({
          views: buildComparison(nextTotals.views, previousTotals.views),
          watch_time: buildComparison(Math.round(nextTotals.watch_time_minutes / 60), Math.round(previousTotals.watch_time_minutes / 60)),
          subscribers: buildComparison(nextTotals.subscribers_net, previousTotals.subscribers_net),
          revenue: buildComparison(nextTotals.estimated_revenue, previousTotals.estimated_revenue),
        })
        const byDay = new Map<string, any>()
        items.forEach((item: any) => {
          byDay.set(item.day, item)
        })
        const sortedUniqueDays = Array.from(
          new Set<string>(
            items
              .map((item: any) => item.day)
              .filter((day: unknown): day is string => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day))
          )
        ).sort((a, b) => a.localeCompare(b))
        if (sortedUniqueDays.length === 0) {
          setSummaryDays([])
          setPublishBucketMeta({})
          setSeries({
            views: [],
            watch_time: [],
            subscribers: [],
            revenue: [],
          })
          return
        }
        const days: string[] = []
        const cursor = new Date(`${sortedUniqueDays[0]}T00:00:00Z`)
        const end = new Date(`${sortedUniqueDays[sortedUniqueDays.length - 1]}T00:00:00Z`)
        while (cursor <= end) {
          days.push(cursor.toISOString().slice(0, 10))
          cursor.setUTCDate(cursor.getUTCDate() + 1)
        }
        setSummaryDays(days)
        setPublishBucketMeta(buildBucketMeta(days, granularity))
        const dailyViews = days.map((day) => ({ date: day, value: byDay.get(day)?.views ?? 0 }))
        const dailyWatchTime = days.map((day) => ({
          date: day,
          value: Math.round((byDay.get(day)?.watch_time_minutes ?? 0) / 60),
        }))
        const dailySubscribers = days.map((day) => ({
          date: day,
          value: (byDay.get(day)?.subscribers_gained ?? 0) - (byDay.get(day)?.subscribers_lost ?? 0),
        }))
        const dailyRevenue = days.map((day) => ({ date: day, value: byDay.get(day)?.estimated_revenue ?? 0 }))
        setSeries({
          views: aggregatePoints(dailyViews, granularity),
          watch_time: aggregatePoints(dailyWatchTime, granularity),
          subscribers: aggregatePoints(dailySubscribers, granularity),
          revenue: aggregatePoints(dailyRevenue, granularity),
        })
      } catch (error) {
        console.error('Failed to load analytics summary', error)
        setComparisons({})
      }
    }

    loadSummary()
  }, [range.start, range.end, contentSelection, granularity, previousRange.start, previousRange.end, previousRange.daySpan])

  useEffect(() => {
    async function loadPublished() {
      try {
        const contentParam = contentSelection === 'all' ? '' : `&content_type=${contentSelection}`
        const response = await fetch(
          `http://127.0.0.1:8000/videos/published?start_date=${range.start}&end_date=${range.end}${contentParam}`
        )
        const data = await response.json()
        const items = Array.isArray(data.items) ? data.items : []
        const map: Record<string, { title: string; published_at: string; thumbnail_url: string; content_type: string }[]> = {}
        items.forEach((item: any) => {
          if (item.day) {
            map[item.day] = Array.isArray(item.items) ? item.items : []
          }
        })
        if (granularity === 'daily') {
          setPublishedDates(map)
          return
        }
        if (summaryDays.length === 0) {
          setPublishedDates({})
          return
        }
        const dayToBucket = buildDayBucketMap(summaryDays, granularity)
        const rebucketed: Record<string, { title: string; published_at: string; thumbnail_url: string; content_type: string }[]> = {}
        Object.entries(map).forEach(([day, dayItems]) => {
          const bucket = dayToBucket.get(day)
          if (!bucket) {
            return
          }
          if (!rebucketed[bucket]) {
            rebucketed[bucket] = []
          }
          rebucketed[bucket].push(...dayItems)
        })
        setPublishedDates(rebucketed)
      } catch (error) {
        console.error('Failed to load published dates', error)
      }
    }

    loadPublished()
  }, [range.start, range.end, contentSelection, granularity, summaryDays])

  useEffect(() => {
    async function loadTopContent() {
      try {
        const contentParam = contentSelection === 'all' ? '' : `&content_type=${contentSelection}`
        const response = await fetch(
          `http://127.0.0.1:8000/analytics/top-content?start_date=${range.start}&end_date=${range.end}&limit=10${contentParam}`
        )
        const data = await response.json()
        const items = Array.isArray(data.items) ? data.items : []
        const formatDuration = (seconds: number) => {
          const mins = Math.floor(seconds / 60)
          const secs = Math.floor(seconds % 60)
          return `${mins}:${secs.toString().padStart(2, '0')}`
        }
        const formatted = items.map((item: any, index: number) => ({
          video_id: String(item.video_id ?? ''),
          rank: index + 1,
          title: item.title,
          published_at: item.published_at ?? '',
          upload_date: formatDisplayDate(item.published_at),
          thumbnail_url: item.thumbnail_url ?? '',
          avg_view_duration: formatDuration(item.avg_view_duration_seconds ?? 0),
          avg_view_pct: `${(item.avg_view_pct ?? 0).toFixed(1)}%`,
          views: Number(item.views ?? 0).toLocaleString(),
        }))
        setTopContent(formatted)
      } catch (error) {
        console.error('Failed to load top content', error)
      }
    }

    loadTopContent()
  }, [range.start, range.end, contentSelection])

  useEffect(() => {
    async function loadLatestContentCards() {
      try {
        const today = new Date()
        const end = today.toISOString().slice(0, 10)
        const start = new Date(today)
        start.setDate(start.getDate() - 89)
        const startDate = start.toISOString().slice(0, 10)
        const [longformResponse, shortResponse] = await Promise.all([
          fetch(
            `http://127.0.0.1:8000/analytics/top-content?start_date=${startDate}&end_date=${end}&limit=10&content_type=video&sort_by=views&direction=desc&privacy_status=public`
          ),
          fetch(
            `http://127.0.0.1:8000/analytics/top-content?start_date=${startDate}&end_date=${end}&limit=10&content_type=short&sort_by=views&direction=desc&privacy_status=public`
          ),
        ])
        const [longformData, shortData] = await Promise.all([longformResponse.json(), shortResponse.json()])
        const mapItems = (payload: any): LatestContentItem[] =>
          (Array.isArray(payload?.items) ? payload.items : []).map((item: any) => ({
            video_id: String(item.video_id ?? ''),
            title: String(item.title ?? '(untitled)'),
            thumbnail_url: String(item.thumbnail_url ?? ''),
            published_at: String(item.published_at ?? ''),
            views: Number(item.views ?? 0),
            watch_time_minutes: Number(item.watch_time_minutes ?? 0),
            avg_view_duration_seconds: Number(item.avg_view_duration_seconds ?? 0),
            avg_view_pct: Number(item.avg_view_pct ?? 0),
          }))
        setLatestLongform(mapItems(longformData))
        setLatestShorts(mapItems(shortData))
      } catch (error) {
        console.error('Failed to load latest content cards', error)
        setLatestLongform([])
        setLatestShorts([])
      }
    }

    loadLatestContentCards()
  }, [])

  useEffect(() => {
    async function loadMonetizationData() {
      try {
        const startDate = range.start
        const endDate = range.end
        const previousStart = previousRange.start
        const previousEnd = previousRange.end

        const monetizationSummaryUrl =
          contentSelection === 'all'
            ? `http://127.0.0.1:8000/analytics/daily/summary?start_date=${startDate}&end_date=${endDate}`
            : `http://127.0.0.1:8000/analytics/daily/summary?start_date=${startDate}&end_date=${endDate}&content_type=${contentSelection}`
        const monetizationPreviousUrl =
          contentSelection === 'all'
            ? `http://127.0.0.1:8000/analytics/daily/summary?start_date=${previousStart}&end_date=${previousEnd}`
            : `http://127.0.0.1:8000/analytics/daily/summary?start_date=${previousStart}&end_date=${previousEnd}&content_type=${contentSelection}`

        const [monetizationSummaryResponse, previousSummaryResponse, videoSummaryResponse, shortSummaryResponse, videoTopResponse, shortTopResponse] = await Promise.all([
          fetch(monetizationSummaryUrl),
          fetch(monetizationPreviousUrl),
          fetch(`http://127.0.0.1:8000/analytics/daily/summary?start_date=${startDate}&end_date=${endDate}&content_type=video`),
          fetch(`http://127.0.0.1:8000/analytics/daily/summary?start_date=${startDate}&end_date=${endDate}&content_type=short`),
          fetch(
            `http://127.0.0.1:8000/analytics/top-content?start_date=${startDate}&end_date=${endDate}&limit=10&content_type=video&sort_by=estimated_revenue&direction=desc&privacy_status=public`
          ),
          fetch(
            `http://127.0.0.1:8000/analytics/top-content?start_date=${startDate}&end_date=${endDate}&limit=10&content_type=short&sort_by=estimated_revenue&direction=desc&privacy_status=public`
          ),
        ])

        const [payload, previousPayload, videoSummary, shortSummary, videoTop, shortTop] = await Promise.all([
          monetizationSummaryResponse.json(),
          previousSummaryResponse.json(),
          videoSummaryResponse.json(),
          shortSummaryResponse.json(),
          videoTopResponse.json(),
          shortTopResponse.json(),
        ])
        const items = Array.isArray(payload?.items) ? payload.items : []
        const byDay = new Map<string, any>()
        items.forEach((item: any) => {
          if (typeof item?.day === 'string') {
            byDay.set(item.day, item)
          }
        })
        const sortedUniqueDays = Array.from(
          new Set<string>(
            items
              .map((item: any) => item.day)
              .filter((day: unknown): day is string => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day))
          )
        ).sort((a, b) => a.localeCompare(b))
        if (sortedUniqueDays.length === 0) {
          setMonetizationSeries({ estimated_revenue: [], ad_impressions: [], monetized_playbacks: [], cpm: [] })
          setMonetizationTotals({ estimated_revenue: 0, ad_impressions: 0, monetized_playbacks: 0, cpm: 0 })
          return
        }
        const days: string[] = []
        const cursor = new Date(`${sortedUniqueDays[0]}T00:00:00Z`)
        const end = new Date(`${sortedUniqueDays[sortedUniqueDays.length - 1]}T00:00:00Z`)
        while (cursor <= end) {
          days.push(cursor.toISOString().slice(0, 10))
          cursor.setUTCDate(cursor.getUTCDate() + 1)
        }
        const dailyRevenue = days.map((day) => ({ date: day, value: Number(byDay.get(day)?.estimated_revenue ?? 0) }))
        const dailyAdImpressions = days.map((day) => ({ date: day, value: Number(byDay.get(day)?.ad_impressions ?? 0) }))
        const dailyMonetizedPlaybacks = days.map((day) => ({
          date: day,
          value: Number(byDay.get(day)?.monetized_playbacks ?? 0),
        }))
        const dailyCpm = days.map((day) => ({ date: day, value: Number(byDay.get(day)?.cpm ?? 0) }))
        setMonetizationSeries({
          estimated_revenue: aggregatePoints(dailyRevenue, granularity),
          ad_impressions: aggregatePoints(dailyAdImpressions, granularity),
          monetized_playbacks: aggregatePoints(dailyMonetizedPlaybacks, granularity),
          cpm: aggregateWeightedPoints(dailyCpm, dailyAdImpressions, granularity),
        })
        setMonetizationTotals({
          estimated_revenue: Number(payload?.totals?.estimated_revenue ?? 0),
          ad_impressions: Number(payload?.totals?.ad_impressions ?? 0),
          monetized_playbacks: Number(payload?.totals?.monetized_playbacks ?? 0),
          cpm: Number(payload?.totals?.cpm ?? 0),
        })

        const previousTotals = {
          estimated_revenue: Number(previousPayload?.totals?.estimated_revenue ?? 0),
          ad_impressions: Number(previousPayload?.totals?.ad_impressions ?? 0),
          monetized_playbacks: Number(previousPayload?.totals?.monetized_playbacks ?? 0),
          cpm: Number(previousPayload?.totals?.cpm ?? 0),
        }
        const windowLabel = previousRange.daySpan === 1 ? '1 day' : `${previousRange.daySpan} days`
        setMonetizationComparisons({
          estimated_revenue: buildComparison(
            Number(payload?.totals?.estimated_revenue ?? 0),
            previousTotals.estimated_revenue,
            windowLabel
          ),
          ad_impressions: buildComparison(
            Number(payload?.totals?.ad_impressions ?? 0),
            previousTotals.ad_impressions,
            windowLabel
          ),
          monetized_playbacks: buildComparison(
            Number(payload?.totals?.monetized_playbacks ?? 0),
            previousTotals.monetized_playbacks,
            windowLabel
          ),
          cpm: buildComparison(
            Number(payload?.totals?.cpm ?? 0),
            previousTotals.cpm,
            windowLabel
          ),
        })

        const monthTotals = new Map<string, number>()
        items.forEach((item: any) => {
          const day = String(item?.day ?? '')
          if (!day || day.length < 7) {
            return
          }
          const monthKey = day.slice(0, 7)
          const value = Number(item?.estimated_revenue ?? 0)
          monthTotals.set(monthKey, (monthTotals.get(monthKey) ?? 0) + value)
        })
        const monthly = Array.from(monthTotals.entries())
          .sort((a: [string, number], b: [string, number]) => b[0].localeCompare(a[0]))
          .map(([monthKey, amount]) => {
            const [year, month] = monthKey.split('-')
            const dateValue = new Date(Date.UTC(Number(year), Number(month) - 1, 1))
            return {
              monthKey,
              label: dateValue.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
              amount,
            }
          })
        setMonthlyEarnings(monthly.slice(0, 12))

        const mapPerformance = (summaryPayload: any, topPayload: any): MonetizationPerformance => {
          const views = Number(summaryPayload?.totals?.views ?? 0)
          const estimatedRevenue = Number(summaryPayload?.totals?.estimated_revenue ?? 0)
          const rpm = views > 0 ? (estimatedRevenue / views) * 1000 : 0
          const topItems = Array.isArray(topPayload?.items) ? topPayload.items : []
          const mapped = topItems.map((item: any) => ({
            video_id: String(item?.video_id ?? ''),
            title: String(item?.title ?? '(untitled)'),
            thumbnail_url: String(item?.thumbnail_url ?? ''),
            revenue: Number(item?.estimated_revenue ?? 0),
          }))
          return { views, estimated_revenue: estimatedRevenue, rpm, items: mapped }
        }
        setContentPerformance({
          video: mapPerformance(videoSummary, videoTop),
          short: mapPerformance(shortSummary, shortTop),
        })
      } catch (error) {
        console.error('Failed to load monetization data', error)
        setMonetizationSeries({ estimated_revenue: [], ad_impressions: [], monetized_playbacks: [], cpm: [] })
        setMonetizationTotals({ estimated_revenue: 0, ad_impressions: 0, monetized_playbacks: 0, cpm: 0 })
        setMonetizationComparisons({})
        setMonthlyEarnings([])
        setContentPerformance({
          video: { views: 0, estimated_revenue: 0, rpm: 0, items: [] },
          short: { views: 0, estimated_revenue: 0, rpm: 0, items: [] },
        })
      }
    }

    loadMonetizationData()
  }, [range.start, range.end, granularity, previousRange.start, previousRange.end, previousRange.daySpan, contentSelection])

  return (
    <section className="page">
      <header className="page-header header-row">
        <div className="header-text">
          <h1>Analytics</h1>
        </div>
        <div className="analytics-range-controls">
          <Dropdown
            value={granularity}
            onChange={(value) => setGranularity(value as Granularity)}
            placeholder="Daily"
            items={[
              { type: 'option' as const, label: 'Daily', value: 'daily' },
              { type: 'option' as const, label: '7-days', value: '7d' },
              { type: 'option' as const, label: '28-days', value: '28d' },
              { type: 'option' as const, label: '90-days', value: '90d' },
              { type: 'option' as const, label: 'Monthly', value: 'monthly' },
              { type: 'option' as const, label: 'Yearly', value: 'yearly' },
            ]}
          />
          <Dropdown
            value={contentSelection}
            onChange={setContentSelection}
            placeholder="All videos"
            items={[
              { type: 'option' as const, label: 'All Videos', value: 'all' },
              { type: 'option' as const, label: 'Longform', value: 'video' },
              { type: 'option' as const, label: 'Shortform', value: 'short' },
            ]}
          />
          <Dropdown
            value={mode}
            onChange={(value) => setMode(value as 'presets' | 'year' | 'custom')}
            placeholder="Presets"
            items={[
              { type: 'option' as const, label: 'Presets', value: 'presets' },
              { type: 'option' as const, label: 'Yearly', value: 'year' },
              { type: 'option' as const, label: 'Custom range', value: 'custom' },
            ]}
          />
          {mode === 'presets' ? (
            <Dropdown
              value={presetSelection}
              onChange={setPresetSelection}
              placeholder="Last 28 days"
              items={rangeOptions.map((option) => ({ type: 'option' as const, ...option }))}
            />
          ) : null}
          {mode === 'year' ? (
            <>
              <Dropdown
                value={yearSelection}
                onChange={setYearSelection}
                placeholder="Select year"
                items={years.map((item) => ({ type: 'option' as const, label: item, value: item }))}
              />
              <Dropdown
                value={monthSelection}
                onChange={setMonthSelection}
                placeholder="All months"
                items={[
                  { type: 'option' as const, label: 'All months', value: 'all' },
                  { type: 'option' as const, label: 'January', value: '1' },
                  { type: 'option' as const, label: 'February', value: '2' },
                  { type: 'option' as const, label: 'March', value: '3' },
                  { type: 'option' as const, label: 'April', value: '4' },
                  { type: 'option' as const, label: 'May', value: '5' },
                  { type: 'option' as const, label: 'June', value: '6' },
                  { type: 'option' as const, label: 'July', value: '7' },
                  { type: 'option' as const, label: 'August', value: '8' },
                  { type: 'option' as const, label: 'September', value: '9' },
                  { type: 'option' as const, label: 'October', value: '10' },
                  { type: 'option' as const, label: 'November', value: '11' },
                  { type: 'option' as const, label: 'December', value: '12' },
                ]}
              />
            </>
          ) : null}
          {mode === 'custom' ? (
            <DateRangePicker
              startDate={customStart}
              endDate={customEnd}
              onChange={(nextStart, nextEnd) => {
                setCustomStart(nextStart)
                setCustomEnd(nextEnd)
              }}
            />
          ) : null}
        </div>
      </header>
      <div className="analytics-tab-row">
        <button
          type="button"
          className={analyticsTab === 'metrics' ? 'analytics-tab active' : 'analytics-tab'}
          onClick={() => setAnalyticsTab('metrics')}
        >
          Metrics
        </button>
        <button
          type="button"
          className={analyticsTab === 'monetization' ? 'analytics-tab active' : 'analytics-tab'}
          onClick={() => setAnalyticsTab('monetization')}
        >
          Monetization
        </button>
      </div>
      <div className="page-body">
        <div className="page-row">
          {analyticsTab === 'metrics' ? (
            <div className="analytics-main-layout">
              <div className="analytics-main-column">
                <PageCard>
                  <MetricChartCard
                    metrics={[
                      { key: 'views', label: 'Views', value: formatWholeNumber(totals.views), comparison: comparisons.views },
                      {
                        key: 'watch_time',
                        label: 'Watch time (hours)',
                        value: formatWholeNumber(Math.round(totals.watch_time_minutes / 60)),
                        comparison: comparisons.watch_time,
                      },
                      { key: 'subscribers', label: 'Subscribers', value: formatWholeNumber(totals.subscribers_net), comparison: comparisons.subscribers },
                      {
                        key: 'revenue',
                        label: 'Estimated revenue',
                        value: formatCurrency(totals.estimated_revenue),
                        comparison: comparisons.revenue,
                      },
                    ]}
                    series={{
                      views: series.views ?? [],
                      watch_time: series.watch_time ?? [],
                      subscribers: series.subscribers ?? [],
                      revenue: series.revenue ?? [],
                    }}
                    publishedDates={publishedDates}
                    publishedBucketMeta={publishBucketMeta}
                  />
                </PageCard>
              <PageCard>
                  <TopContentTable items={topContent} />
                </PageCard>
              </div>
              <div className="analytics-side-cards">
                <PageCard>
                  <VideoDetailListCard
                    title="Top longform content (last 90 days)"
                    items={latestLongform}
                    onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
                  />
                </PageCard>
              <PageCard>
                  <VideoDetailListCard
                    title="Top short content (last 90 days)"
                    items={latestShorts}
                    onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
                  />
                </PageCard>
              </div>
            </div>
          ) : (
            <div className="analytics-monetization-layout">
              <PageCard>
                <MetricChartCard
                  metrics={[
                    {
                      key: 'estimated_revenue',
                      label: 'Estimated revenue',
                      value: formatCurrency(monetizationTotals.estimated_revenue),
                      comparison: monetizationComparisons.estimated_revenue,
                    },
                    {
                      key: 'ad_impressions',
                      label: 'Ad impressions',
                      value: formatWholeNumber(monetizationTotals.ad_impressions),
                      comparison: monetizationComparisons.ad_impressions,
                    },
                    {
                      key: 'monetized_playbacks',
                      label: 'Monetized playbacks',
                      value: formatWholeNumber(monetizationTotals.monetized_playbacks),
                      comparison: monetizationComparisons.monetized_playbacks,
                    },
                    {
                      key: 'cpm',
                      label: 'CPM',
                      value: formatCurrency(monetizationTotals.cpm),
                      comparison: monetizationComparisons.cpm,
                    },
                  ]}
                  series={{
                    estimated_revenue: monetizationSeries.estimated_revenue ?? [],
                    ad_impressions: monetizationSeries.ad_impressions ?? [],
                    monetized_playbacks: monetizationSeries.monetized_playbacks ?? [],
                    cpm: monetizationSeries.cpm ?? [],
                  }}
                  publishedDates={publishedDates}
                  publishedBucketMeta={publishBucketMeta}
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
                    onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
                  />
                </PageCard>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default Analytics

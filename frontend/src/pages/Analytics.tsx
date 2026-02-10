import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DateRangePicker, Dropdown } from '../components/ui'
import { MetricChartCard, TopContentTable, VideoDetailListCard } from '../components/analytics'
import { PageCard } from '../components/layout'
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
  avg_view_duration_seconds: number
  avg_view_pct: number
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
          upload_date: item.published_at ? new Date(item.published_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '',
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
        const [longformResponse, shortResponse] = await Promise.all([
          fetch(
            `http://127.0.0.1:8000/analytics/top-content?start_date=${range.start}&end_date=${range.end}&limit=10&content_type=video&sort_by=published_at&direction=desc&privacy_status=public`
          ),
          fetch(
            `http://127.0.0.1:8000/analytics/top-content?start_date=${range.start}&end_date=${range.end}&limit=10&content_type=short&sort_by=published_at&direction=desc&privacy_status=public`
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
  }, [range.start, range.end])

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
      <div className="page-body">
        <div className="page-row">
          <div className="analytics-main-layout">
            <div className="analytics-main-column">
              <PageCard>
                <MetricChartCard
                  metrics={[
                    { key: 'views', label: 'Views', value: totals.views.toLocaleString(), comparison: comparisons.views },
                    {
                      key: 'watch_time',
                      label: 'Watch time (hours)',
                      value: Math.round(totals.watch_time_minutes / 60).toLocaleString(),
                      comparison: comparisons.watch_time,
                    },
                    { key: 'subscribers', label: 'Subscribers', value: totals.subscribers_net.toLocaleString(), comparison: comparisons.subscribers },
                    {
                      key: 'revenue',
                      label: 'Estimated revenue',
                      value: `$${Math.round(totals.estimated_revenue).toLocaleString()}`,
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
                  title="Latest longform content"
                  items={latestLongform}
                  onOpenVideo={(videoId) => navigate(`/videoDetails/${videoId}`)}
                  onOpenComments={(videoId) => navigate(`/videoDetails/${videoId}?tab=comments`)}
                />
              </PageCard>
              <PageCard>
                <VideoDetailListCard
                  title="Latest short content"
                  items={latestShorts}
                  onOpenVideo={(videoId) => navigate(`/videoDetails/${videoId}`)}
                  onOpenComments={(videoId) => navigate(`/videoDetails/${videoId}?tab=comments`)}
                />
              </PageCard>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Analytics

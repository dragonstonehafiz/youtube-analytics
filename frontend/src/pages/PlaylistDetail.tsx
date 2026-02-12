import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ActionButton, DateRangePicker, Dropdown, PageSizePicker, PageSwitcher } from '../components/ui'
import { MetricChartCard, VideoDetailListCard, type VideoDetailListItem } from '../components/analytics'
import { PageCard } from '../components/layout'
import { PlaylistItemsTable, type PlaylistItemRowData, type PlaylistItemSortKey } from '../components/playlists'
import { formatDisplayDate } from '../utils/date'
import { formatCurrency, formatWholeNumber } from '../utils/number'
import { getSharedPageSize, getStored, setSharedPageSize, setStored } from '../utils/storage'
import './Page.css'

type PlaylistMeta = {
  id: string
  title: string | null
  description: string | null
  published_at: string | null
  privacy_status: string | null
  item_count: number | null
  thumbnail_url: string | null
}

type Granularity = 'daily' | '7d' | '28d' | '90d' | 'monthly' | 'yearly'
type PlaylistViewMode = 'playlist_views' | 'video_views'
type SeriesPoint = { date: string; value: number }
type PublishedItem = { title: string; published_at: string; thumbnail_url: string; content_type: string }
type BucketMeta = { startDate: string; endDate: string; dayCount: number }
type PlaylistDailyRow = {
  day: string
  views: number | null
  watch_time_minutes?: number | null
  average_view_duration_seconds?: number | null
  estimated_revenue?: number | null
  subscribers_gained?: number | null
  subscribers_lost?: number | null
  average_time_in_playlist_seconds?: number | null
}
type MetricKey = 'views' | 'watch_time' | 'subscribers' | 'revenue'
type MetricComparison = {
  direction: 'up' | 'down' | 'flat'
  percentText: string
}

function formatDurationSeconds(seconds: number | null | undefined): string {
  const value = Number(seconds ?? 0)
  if (!Number.isFinite(value) || value <= 0) {
    return '-'
  }
  const rounded = Math.round(value)
  const mins = Math.floor(rounded / 60)
  const secs = rounded % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
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
    const grouped = new Map<string, number>()
    points.forEach((point) => {
      const key = granularity === 'monthly' ? point.date.slice(0, 7) : `${point.date.slice(0, 4)}-01-01`
      grouped.set(key, (grouped.get(key) ?? 0) + point.value)
    })
    return Array.from(grouped.entries()).map(([date, value]) => ({ date, value }))
  }
  const windowSize = granularity === '7d' ? 7 : granularity === '28d' ? 28 : 90
  const aggregated: SeriesPoint[] = []
  for (let index = 0; index < points.length; index += windowSize) {
    const bucket = points.slice(index, index + windowSize)
    aggregated.push({
      date: bucket[bucket.length - 1].date,
      value: bucket.reduce((sum, point) => sum + point.value, 0),
    })
  }
  return aggregated
}

function PlaylistDetail() {
  const { playlistId } = useParams()
  const navigate = useNavigate()
  const [meta, setMeta] = useState<PlaylistMeta | null>(null)
  const [items, setItems] = useState<PlaylistItemRowData[]>([])
  const [total, setTotal] = useState(0)
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [loadingItems, setLoadingItems] = useState(false)
  const [errorMeta, setErrorMeta] = useState<string | null>(null)
  const [errorItems, setErrorItems] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(() => getSharedPageSize(10))
  const [sortBy, setSortBy] = useState<PlaylistItemSortKey>('position')
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc')
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)
  const [years, setYears] = useState<string[]>([])
  const rangeOptions = [
    { label: 'Last 7 days', value: 'range:7d' },
    { label: 'Last 28 days', value: 'range:28d' },
    { label: 'Last 365 days', value: 'range:365d' },
    { label: 'Full data', value: 'full' },
  ]
  const storedRange = getStored('playlistDetailRange', null as {
    mode?: 'presets' | 'year' | 'custom'
    presetSelection?: string
    yearSelection?: string
    monthSelection?: string
    customStart?: string
    customEnd?: string
  } | null)
  const [mode, setMode] = useState<'presets' | 'year' | 'custom'>(storedRange?.mode ?? 'presets')
  const [presetSelection, setPresetSelection] = useState(storedRange?.presetSelection ?? 'full')
  const [yearSelection, setYearSelection] = useState(storedRange?.yearSelection ?? '')
  const [monthSelection, setMonthSelection] = useState(storedRange?.monthSelection ?? 'all')
  const today = new Date().toISOString().slice(0, 10)
  const [customStart, setCustomStart] = useState(storedRange?.customStart ?? today)
  const [customEnd, setCustomEnd] = useState(storedRange?.customEnd ?? today)
  const [viewMode, setViewMode] = useState<PlaylistViewMode>(getStored('playlistDetailViewMode', 'playlist_views'))
  const [granularity, setGranularity] = useState<Granularity>(getStored('playlistDetailGranularity', 'daily'))
  const [dailyRows, setDailyRows] = useState<PlaylistDailyRow[]>([])
  const [series, setSeries] = useState<Record<string, SeriesPoint[]>>({})
  const [summaryDays, setSummaryDays] = useState<string[]>([])
  const [publishedDates, setPublishedDates] = useState<Record<string, PublishedItem[]>>({})
  const [publishBucketMeta, setPublishBucketMeta] = useState<Record<string, BucketMeta>>({})
  const [totals, setTotals] = useState({
    views: 0,
    watch_time_minutes: 0,
    subscribers_net: 0,
    estimated_revenue: 0,
    average_view_duration_seconds: 0,
    average_time_in_playlist_seconds: 0,
  })
  const [comparisons, setComparisons] = useState<Partial<Record<MetricKey, MetricComparison>>>({})
  const [topPerformingItems, setTopPerformingItems] = useState<VideoDetailListItem[]>([])
  const [topPerformingError, setTopPerformingError] = useState<string | null>(null)
  const [recentPerformingItems, setRecentPerformingItems] = useState<VideoDetailListItem[]>([])
  const [recentPerformingError, setRecentPerformingError] = useState<string | null>(null)
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])
  const range = useMemo(() => {
    const now = new Date()
    const utcToday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    const format = (value: Date) => value.toISOString().slice(0, 10)
    if (mode === 'presets') {
      if (presetSelection.startsWith('range:')) {
        const days = parseInt(presetSelection.split(':')[1].replace('d', ''), 10)
        const start = new Date(utcToday)
        start.setUTCDate(start.getUTCDate() - (days - 1))
        return { start: format(start), end: format(utcToday) }
      }
      if (presetSelection === 'full') {
        if (years.length > 0) {
          const parsed = years.map((value) => parseInt(value, 10)).filter((value) => !Number.isNaN(value))
          const minYear = Math.min(...parsed)
          const maxYear = Math.max(...parsed)
          return { start: `${minYear}-01-01`, end: `${maxYear}-12-31` }
        }
        return { start: format(utcToday), end: format(utcToday) }
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
      }
    }
    if (mode === 'custom') {
      return { start: customStart, end: customEnd }
    }
    return { start: format(utcToday), end: format(utcToday) }
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
    async function loadMeta() {
      if (!playlistId) {
        setMeta(null)
        setErrorMeta('Missing playlist ID.')
        return
      }
      setLoadingMeta(true)
      setErrorMeta(null)
      try {
        const response = await fetch(`http://127.0.0.1:8000/playlists/${playlistId}`)
        if (!response.ok) {
          throw new Error(`Failed to load playlist (${response.status})`)
        }
        const data = await response.json()
        setMeta((data.item ?? null) as PlaylistMeta | null)
      } catch (err) {
        setErrorMeta(err instanceof Error ? err.message : 'Failed to load playlist.')
      } finally {
        setLoadingMeta(false)
      }
    }

    loadMeta()
  }, [playlistId])

  useEffect(() => {
    async function loadItems() {
      if (!playlistId) {
        setItems([])
        setTotal(0)
        setErrorItems('Missing playlist ID.')
        return
      }
      setLoadingItems(true)
      setErrorItems(null)
      try {
        const offset = (page - 1) * pageSize
        const params = new URLSearchParams({
          limit: String(pageSize),
          offset: String(offset),
          sort_by: sortBy,
          direction,
        })
        const response = await fetch(`http://127.0.0.1:8000/playlists/${playlistId}/items?${params.toString()}`)
        if (!response.ok) {
          throw new Error(`Failed to load playlist items (${response.status})`)
        }
        const data = await response.json()
        setItems(Array.isArray(data.items) ? (data.items as PlaylistItemRowData[]) : [])
        setTotal(typeof data.total === 'number' ? data.total : 0)
      } catch (err) {
        setErrorItems(err instanceof Error ? err.message : 'Failed to load playlist items.')
      } finally {
        setLoadingItems(false)
      }
    }

    loadItems()
  }, [playlistId, page, pageSize, sortBy, direction])

  useEffect(() => {
    async function loadTopPerformingItems() {
      if (!playlistId) {
        setTopPerformingItems([])
        setTopPerformingError('Missing playlist ID.')
        return
      }
      setTopPerformingError(null)
      try {
        const params = new URLSearchParams({
          limit: '10',
          offset: '0',
          sort_by: 'views',
          direction: 'desc',
        })
        const response = await fetch(`http://127.0.0.1:8000/playlists/${playlistId}/items?${params.toString()}`)
        if (!response.ok) {
          throw new Error(`Failed to load top playlist content (${response.status})`)
        }
        const data = await response.json()
        const rows = Array.isArray(data.items) ? (data.items as PlaylistItemRowData[]) : []
        const mapped: VideoDetailListItem[] = rows
          .filter((item) => Boolean(item.video_id))
          .map((item) => ({
            video_id: item.video_id as string,
            title: item.video_title || item.title || '(untitled)',
            thumbnail_url: item.video_thumbnail_url || item.thumbnail_url || '',
            published_at: item.video_published_at || item.published_at || '',
            views: item.video_view_count ?? 0,
            watch_time_minutes: item.video_watch_time_minutes ?? 0,
            avg_view_duration_seconds: item.video_average_view_duration_seconds ?? 0,
            avg_view_pct: 0,
          }))
        setTopPerformingItems(mapped)
      } catch (err) {
        setTopPerformingError(err instanceof Error ? err.message : 'Failed to load top playlist content.')
        setTopPerformingItems([])
      }
    }

    loadTopPerformingItems()
  }, [playlistId])

  useEffect(() => {
    async function loadRecentPerformingItems() {
      if (!playlistId) {
        setRecentPerformingItems([])
        setRecentPerformingError('Missing playlist ID.')
        return
      }
      setRecentPerformingError(null)
      try {
        const params = new URLSearchParams({
          limit: '10',
          offset: '0',
          sort_by: 'recent_views',
          direction: 'desc',
        })
        const response = await fetch(`http://127.0.0.1:8000/playlists/${playlistId}/items?${params.toString()}`)
        if (!response.ok) {
          throw new Error(`Failed to load recent top playlist content (${response.status})`)
        }
        const data = await response.json()
        const rows = Array.isArray(data.items) ? (data.items as PlaylistItemRowData[]) : []
        const mapped: VideoDetailListItem[] = rows
          .filter((item) => Boolean(item.video_id))
          .map((item) => ({
            video_id: item.video_id as string,
            title: item.video_title || item.title || '(untitled)',
            thumbnail_url: item.video_thumbnail_url || item.thumbnail_url || '',
            published_at: item.video_published_at || item.published_at || '',
            views: item.video_recent_views ?? 0,
            watch_time_minutes: item.video_watch_time_minutes ?? 0,
            avg_view_duration_seconds: item.video_average_view_duration_seconds ?? 0,
            avg_view_pct: 0,
          }))
        setRecentPerformingItems(mapped)
      } catch (err) {
        setRecentPerformingError(err instanceof Error ? err.message : 'Failed to load recent top playlist content.')
        setRecentPerformingItems([])
      }
    }

    loadRecentPerformingItems()
  }, [playlistId])

  useEffect(() => {
    setPage(1)
  }, [pageSize, sortBy, direction])

  useEffect(() => {
    setSharedPageSize(pageSize)
  }, [pageSize])

  useEffect(() => {
    setStored('playlistDetailRange', {
      mode,
      presetSelection,
      yearSelection,
      monthSelection,
      customStart,
      customEnd,
    })
  }, [mode, presetSelection, yearSelection, monthSelection, customStart, customEnd])

  useEffect(() => {
    setStored('playlistDetailViewMode', viewMode)
  }, [viewMode])

  useEffect(() => {
    setStored('playlistDetailGranularity', granularity)
  }, [granularity])

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
    async function loadPlaylistAnalytics() {
      if (!playlistId) {
        setDailyRows([])
        setTotals({
          views: 0,
          watch_time_minutes: 0,
          subscribers_net: 0,
          estimated_revenue: 0,
          average_view_duration_seconds: 0,
          average_time_in_playlist_seconds: 0,
        })
        setComparisons({})
        setSeries({ views: [], watch_time: [], subscribers: [], revenue: [] })
        setAnalyticsError('Missing playlist ID.')
        return
      }
      setAnalyticsLoading(true)
      setAnalyticsError(null)
      try {
        const endpoint =
          viewMode === 'playlist_views'
            ? '/analytics/playlist-daily'
            : '/analytics/playlist-video-daily'
        const [currentResponse, previousResponse] = await Promise.all([
          fetch(
            `http://127.0.0.1:8000${endpoint}?playlist_id=${playlistId}&start_date=${range.start}&end_date=${range.end}`
          ),
          fetch(
            `http://127.0.0.1:8000${endpoint}?playlist_id=${playlistId}&start_date=${previousRange.start}&end_date=${previousRange.end}`
          ),
        ])
        if (!currentResponse.ok) {
          throw new Error(`Failed to load playlist analytics (${currentResponse.status})`)
        }
        if (!previousResponse.ok) {
          throw new Error(`Failed to load previous playlist analytics (${previousResponse.status})`)
        }
        const [data, previousData] = await Promise.all([currentResponse.json(), previousResponse.json()])
        const items = (Array.isArray(data.items) ? data.items : []) as PlaylistDailyRow[]
        const sorted = [...items]
          .filter((item) => typeof item.day === 'string')
          .sort((a, b) => a.day.localeCompare(b.day))
        setDailyRows(sorted)
        const gained = data.totals?.subscribers_gained ?? 0
        const lost = data.totals?.subscribers_lost ?? 0
        const nextTotals = {
          views: data.totals?.views ?? 0,
          watch_time_minutes: data.totals?.watch_time_minutes ?? 0,
          subscribers_net: gained - lost,
          estimated_revenue: data.totals?.estimated_revenue ?? 0,
          average_view_duration_seconds: data.totals?.average_view_duration_seconds ?? 0,
          average_time_in_playlist_seconds: data.totals?.average_time_in_playlist_seconds ?? 0,
        }
        setTotals(nextTotals)
        const previousGained = previousData.totals?.subscribers_gained ?? 0
        const previousLost = previousData.totals?.subscribers_lost ?? 0
        const previousTotals = {
          views: previousData.totals?.views ?? 0,
          watch_time_minutes: previousData.totals?.watch_time_minutes ?? 0,
          subscribers_net: previousGained - previousLost,
          estimated_revenue: previousData.totals?.estimated_revenue ?? 0,
          average_view_duration_seconds: previousData.totals?.average_view_duration_seconds ?? 0,
          average_time_in_playlist_seconds: previousData.totals?.average_time_in_playlist_seconds ?? 0,
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
        const nextComparisons: Partial<Record<MetricKey, MetricComparison>> = {
          views: buildComparison(nextTotals.views, previousTotals.views),
        }
        if (viewMode === 'video_views') {
          nextComparisons.watch_time = buildComparison(
            Math.round(nextTotals.watch_time_minutes / 60),
            Math.round(previousTotals.watch_time_minutes / 60),
          )
          nextComparisons.subscribers = buildComparison(nextTotals.subscribers_net, previousTotals.subscribers_net)
          nextComparisons.revenue = buildComparison(nextTotals.estimated_revenue, previousTotals.estimated_revenue)
        } else {
          nextComparisons.watch_time = buildComparison(
            Math.round(nextTotals.watch_time_minutes / 60),
            Math.round(previousTotals.watch_time_minutes / 60),
          )
          nextComparisons.subscribers = buildComparison(
            nextTotals.average_view_duration_seconds,
            previousTotals.average_view_duration_seconds,
          )
          nextComparisons.revenue = buildComparison(
            nextTotals.average_time_in_playlist_seconds,
            previousTotals.average_time_in_playlist_seconds,
          )
        }
        setComparisons(nextComparisons)
      } catch (err) {
        setAnalyticsError(err instanceof Error ? err.message : 'Failed to load playlist analytics.')
      } finally {
        setAnalyticsLoading(false)
      }
    }

    loadPlaylistAnalytics()
  }, [playlistId, range.start, range.end, previousRange.start, previousRange.end, previousRange.daySpan, viewMode])

  useEffect(() => {
    try {
      const sorted = [...dailyRows]
        .filter((item) => typeof item.day === 'string' && item.day >= range.start && item.day <= range.end)
        .sort((a, b) => a.day.localeCompare(b.day))
      if (sorted.length === 0) {
        setSeries({ views: [], watch_time: [], subscribers: [], revenue: [] })
        setSummaryDays([])
        setPublishBucketMeta({})
        setTotals({
          views: 0,
          watch_time_minutes: 0,
          subscribers_net: 0,
          estimated_revenue: 0,
          average_view_duration_seconds: 0,
          average_time_in_playlist_seconds: 0,
        })
        return
      }
      const byDay = new Map<string, PlaylistDailyRow>()
      sorted.forEach((item) => byDay.set(item.day, item))
      const days: string[] = []
      const cursor = new Date(`${sorted[0].day}T00:00:00Z`)
      const end = new Date(`${sorted[sorted.length - 1].day}T00:00:00Z`)
      while (cursor <= end) {
        days.push(cursor.toISOString().slice(0, 10))
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      }
      setSummaryDays(days)
      setPublishBucketMeta(buildBucketMeta(days, granularity))
      const viewsSeries = days.map((day) => ({ date: day, value: byDay.get(day)?.views ?? 0 }))
      const watchSeries = days.map((day) => ({ date: day, value: Math.round((byDay.get(day)?.watch_time_minutes ?? 0) / 60) }))
      const subsSeries = days.map((day) => {
        if (viewMode === 'playlist_views') {
          return { date: day, value: byDay.get(day)?.average_view_duration_seconds ?? 0 }
        }
        return {
          date: day,
          value: (byDay.get(day)?.subscribers_gained ?? 0) - (byDay.get(day)?.subscribers_lost ?? 0),
        }
      })
      const revenueSeries = days.map((day) => ({
        date: day,
        value: viewMode === 'playlist_views'
          ? byDay.get(day)?.average_time_in_playlist_seconds ?? 0
          : byDay.get(day)?.estimated_revenue ?? 0,
      }))
      setSeries({
        views: aggregatePoints(viewsSeries, granularity),
        watch_time: aggregatePoints(watchSeries, granularity),
        subscribers: aggregatePoints(subsSeries, granularity),
        revenue: aggregatePoints(revenueSeries, granularity),
      })
      setTotals({
        views: sorted.reduce((sum, item) => sum + (item.views ?? 0), 0),
        watch_time_minutes: sorted.reduce((sum, item) => sum + (item.watch_time_minutes ?? 0), 0),
        subscribers_net: sorted.reduce(
          (sum, item) => sum + (item.subscribers_gained ?? 0) - (item.subscribers_lost ?? 0),
          0
        ),
        estimated_revenue: sorted.reduce((sum, item) => sum + (item.estimated_revenue ?? 0), 0),
        average_view_duration_seconds: sorted.reduce((sum, item) => sum + (item.average_view_duration_seconds ?? 0), 0) / sorted.length,
        average_time_in_playlist_seconds: sorted.reduce((sum, item) => sum + (item.average_time_in_playlist_seconds ?? 0), 0) / sorted.length,
      })
    } catch (err) {
      setAnalyticsError(err instanceof Error ? err.message : 'Failed to process playlist analytics.')
    }
  }, [dailyRows, range.start, range.end, granularity, viewMode])

  useEffect(() => {
    async function loadPublished() {
      if (!playlistId) {
        setPublishedDates({})
        return
      }
      try {
        const response = await fetch(
          `http://127.0.0.1:8000/playlists/${playlistId}/published?start_date=${range.start}&end_date=${range.end}`
        )
        if (!response.ok) {
          throw new Error(`Failed to load playlist published dates (${response.status})`)
        }
        const data = await response.json()
        const items = Array.isArray(data.items) ? data.items : []
        const map: Record<string, PublishedItem[]> = {}
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
        const rebucketed: Record<string, PublishedItem[]> = {}
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
        console.error('Failed to load playlist published dates', error)
      }
    }

    loadPublished()
  }, [playlistId, range.start, range.end, granularity, summaryDays])

  const toggleSort = (key: PlaylistItemSortKey) => {
    if (sortBy === key) {
      setDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortBy(key)
    setDirection(key === 'position' ? 'asc' : 'desc')
  }

  return (
    <section className="page">
      <header className="page-header">
        <div className="header-inline-title">
          <ActionButton label="<" onClick={() => navigate(-1)} variant="soft" bordered={false} className="header-back-action" />
          <h1>Playlist</h1>
        </div>
      </header>
      <div className="page-body">
        <div className="page-row">
          <PageCard>
            {loadingMeta ? (
              <div className="video-detail-state">Loading playlist metadata...</div>
            ) : errorMeta ? (
              <div className="video-detail-state">{errorMeta}</div>
            ) : meta ? (
              <div className="video-detail-layout">
                <div className="video-detail-meta">
                  {meta.thumbnail_url ? (
                    <img className="video-detail-thumb" src={meta.thumbnail_url} alt={meta.title ?? 'Playlist'} />
                  ) : (
                    <div className="video-detail-thumb" />
                  )}
                  <div className="video-detail-meta-content">
                    <div className="video-detail-title">{meta.title || '(untitled)'}</div>
                    <div className="video-detail-description">{meta.description || '-'}</div>
                  </div>
                </div>
                <div className="video-detail-grid">
                  <div className="video-detail-item">
                    <span>Visibility</span>
                    <strong>{meta.privacy_status || '-'}</strong>
                  </div>
                  <div className="video-detail-item">
                    <span>Published</span>
                    <strong>{formatDisplayDate(meta.published_at)}</strong>
                  </div>
                  <div className="video-detail-item">
                    <span>Total items</span>
                    <strong>{(meta.item_count ?? 0).toLocaleString()}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="video-detail-state">Playlist metadata</div>
            )}
          </PageCard>
        </div>
        <div className="page-row">
          <div className="playlist-detail-analytics-toolbar">
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
                  value={viewMode}
                  onChange={(value) => setViewMode(value as PlaylistViewMode)}
                  placeholder="Playlist Views"
                  items={[
                    { type: 'option' as const, label: 'Playlist Views', value: 'playlist_views' },
                    { type: 'option' as const, label: 'Video Views', value: 'video_views' },
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
                    placeholder="Full data"
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
          </div>
        </div>
        <div className="page-row">
          <PageCard>
            {analyticsLoading ? (
              <div className="video-detail-state">Loading playlist analytics...</div>
            ) : analyticsError ? (
              <div className="video-detail-state">{analyticsError}</div>
            ) : (
              <MetricChartCard
                metrics={[
                  {
                    key: 'views',
                    label: viewMode === 'playlist_views' ? 'Playlist Views' : 'Video Views',
                    value: formatWholeNumber(totals.views),
                    comparison: comparisons.views,
                  },
                  {
                    key: 'watch_time',
                    label: 'Watch time (hours)',
                    value: formatWholeNumber(Math.round(totals.watch_time_minutes / 60)),
                    comparison: comparisons.watch_time,
                  },
                  {
                    key: 'subscribers',
                    label: viewMode === 'video_views' ? 'Subscribers' : 'Avg view duration',
                    value: viewMode === 'video_views'
                      ? formatWholeNumber(totals.subscribers_net)
                      : formatDurationSeconds(totals.average_view_duration_seconds),
                    comparison: comparisons.subscribers,
                  },
                  {
                    key: 'revenue',
                    label: viewMode === 'video_views' ? 'Estimated revenue' : 'Avg time in playlist',
                    value: viewMode === 'video_views'
                      ? formatCurrency(totals.estimated_revenue)
                      : formatDurationSeconds(totals.average_time_in_playlist_seconds),
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
            )}
          </PageCard>
        </div>
        <div className="page-row">
          <div className="playlist-detail-items-layout">
            <PageCard>
              {loadingItems ? (
                <div className="video-detail-state">Loading playlist items...</div>
              ) : errorItems ? (
                <div className="video-detail-state">{errorItems}</div>
              ) : (
                <PlaylistItemsTable items={items} sortBy={sortBy} direction={direction} onToggleSort={toggleSort} />
              )}
              <div className="pagination-footer">
                <div className="pagination-main">
                  <PageSwitcher currentPage={page} totalPages={totalPages} onPageChange={setPage} />
                </div>
                <div className="pagination-size">
                  <PageSizePicker value={pageSize} onChange={setPageSize} />
                </div>
              </div>
            </PageCard>
            <div className="playlist-detail-side-cards">
              <PageCard>
                {topPerformingError ? (
                  <div className="video-detail-state">{topPerformingError}</div>
                ) : (
                  <VideoDetailListCard
                    title="Top performing content"
                    items={topPerformingItems}
                    onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
                    emptyText="No playlist videos available."
                    actionLabel="See analytics"
                    showTypicalRange
                    metrics={['views', 'watch_time', 'avg_duration']}
                  />
                )}
              </PageCard>
              <PageCard>
                {recentPerformingError ? (
                  <div className="video-detail-state">{recentPerformingError}</div>
                ) : (
                  <VideoDetailListCard
                    title="Top performing content (last 90 days)"
                    items={recentPerformingItems}
                    onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
                    emptyText="No recent playlist video activity."
                    actionLabel="See analytics"
                    showTypicalRange
                    metrics={['views', 'watch_time', 'avg_duration']}
                  />
                )}
              </PageCard>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default PlaylistDetail

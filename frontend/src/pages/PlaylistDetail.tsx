import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ActionButton, DateRangePicker, Dropdown, PageSizePicker, PageSwitcher } from '../components/ui'
import {
  MetricChartCard,
  MonetizationContentPerformanceCard,
  MonetizationEarningsCard,
  TrafficSourceShareCard,
  TrafficSourceTopVideosCard,
  VideoDetailListCard,
  type TopTrafficVideo,
  type TrafficSourceShareItem,
  type VideoDetailListItem,
} from '../components/analytics'
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
type PlaylistAnalyticsTab = 'metrics' | 'monetization' | 'discovery'
type SeriesPoint = { date: string; value: number }
type DiscoveryMultiSeries = { key: string; label: string; color: string; points: SeriesPoint[] }
type TrafficSourceRow = { day: string; traffic_source: string; views: number; watch_time_minutes: number }
type PublishedItem = { video_id?: string; title: string; published_at: string; thumbnail_url: string; content_type: string }
type PlaylistDailyRow = {
  day: string
  views: number | null
  watch_time_minutes?: number | null
  average_view_duration_seconds?: number | null
  estimated_revenue?: number | null
  ad_impressions?: number | null
  monetized_playbacks?: number | null
  cpm?: number | null
  subscribers_gained?: number | null
  subscribers_lost?: number | null
  average_time_in_playlist_seconds?: number | null
}
type MonetizationMonthly = {
  monthKey: string
  label: string
  amount: number
}
type MonetizationContentType = 'video' | 'short'
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
type TopVideosBySourceResponseItem = {
  video_id: string
  title: string
  thumbnail_url: string
  published_at: string
  views: number
  watch_time_minutes: number
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
  const [analyticsTab, setAnalyticsTab] = useState<PlaylistAnalyticsTab>(getStored('playlistDetailTab', 'metrics'))
  const [dailyRows, setDailyRows] = useState<PlaylistDailyRow[]>([])
  const [previousDailyRows, setPreviousDailyRows] = useState<PlaylistDailyRow[]>([])
  const [playlistDailyRows, setPlaylistDailyRows] = useState<PlaylistDailyRow[]>([])
  const [videoDailyRows, setVideoDailyRows] = useState<PlaylistDailyRow[]>([])
  const [previousPlaylistDailyRows, setPreviousPlaylistDailyRows] = useState<PlaylistDailyRow[]>([])
  const [previousVideoDailyRows, setPreviousVideoDailyRows] = useState<PlaylistDailyRow[]>([])
  const [series, setSeries] = useState<Record<string, SeriesPoint[]>>({})
  const [previousSeries, setPreviousSeries] = useState<Record<string, SeriesPoint[]>>({})
  const [discoveryTrafficRows, setDiscoveryTrafficRows] = useState<TrafficSourceRow[]>([])
  const [discoveryPreviousTrafficRows, setDiscoveryPreviousTrafficRows] = useState<TrafficSourceRow[]>([])
  const [trafficTopSource, setTrafficTopSource] = useState('')
  const [trafficTopVideos, setTrafficTopVideos] = useState<TopTrafficVideo[]>([])
  const [trafficTopLoading, setTrafficTopLoading] = useState(false)
  const [trafficTopError, setTrafficTopError] = useState<string | null>(null)
  const [publishedDates, setPublishedDates] = useState<Record<string, PublishedItem[]>>({})
  const [totals, setTotals] = useState({
    views: 0,
    watch_time_minutes: 0,
    subscribers_net: 0,
    estimated_revenue: 0,
    average_view_duration_seconds: 0,
    average_time_in_playlist_seconds: 0,
  })
  const [topPerformingItems, setTopPerformingItems] = useState<VideoDetailListItem[]>([])
  const [topPerformingError, setTopPerformingError] = useState<string | null>(null)
  const [recentPerformingItems, setRecentPerformingItems] = useState<VideoDetailListItem[]>([])
  const [recentPerformingError, setRecentPerformingError] = useState<string | null>(null)
  const [monetizationContentType, setMonetizationContentType] = useState<MonetizationContentType>('video')
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
    setStored('playlistDetailTab', analyticsTab)
  }, [analyticsTab])

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
        setPlaylistDailyRows([])
        setVideoDailyRows([])
        setPreviousPlaylistDailyRows([])
        setPreviousVideoDailyRows([])
        setDailyRows([])
        setPreviousDailyRows([])
        setTotals({
          views: 0,
          watch_time_minutes: 0,
          subscribers_net: 0,
          estimated_revenue: 0,
          average_view_duration_seconds: 0,
          average_time_in_playlist_seconds: 0,
        })
        setSeries({ views: [], watch_time: [], subscribers: [], revenue: [] })
        setPreviousSeries({ views: [], watch_time: [], subscribers: [], revenue: [] })
        setAnalyticsError('Missing playlist ID.')
        return
      }
      setAnalyticsLoading(true)
      setAnalyticsError(null)
      try {
        const [
          playlistCurrentResponse,
          playlistPreviousResponse,
          videoCurrentResponse,
          videoPreviousResponse,
        ] = await Promise.all([
          fetch(
            `http://127.0.0.1:8000/analytics/playlist-daily?playlist_id=${playlistId}&start_date=${range.start}&end_date=${range.end}`
          ),
          fetch(
            `http://127.0.0.1:8000/analytics/playlist-daily?playlist_id=${playlistId}&start_date=${previousRange.start}&end_date=${previousRange.end}`
          ),
          fetch(
            `http://127.0.0.1:8000/analytics/playlist-video-daily?playlist_id=${playlistId}&start_date=${range.start}&end_date=${range.end}`
          ),
          fetch(
            `http://127.0.0.1:8000/analytics/playlist-video-daily?playlist_id=${playlistId}&start_date=${previousRange.start}&end_date=${previousRange.end}`
          ),
        ])
        if (!playlistCurrentResponse.ok || !playlistPreviousResponse.ok || !videoCurrentResponse.ok || !videoPreviousResponse.ok) {
          const status = !playlistCurrentResponse.ok
            ? playlistCurrentResponse.status
            : !playlistPreviousResponse.ok
              ? playlistPreviousResponse.status
              : !videoCurrentResponse.ok
                ? videoCurrentResponse.status
                : videoPreviousResponse.status
          throw new Error(`Failed to load playlist analytics (${status})`)
        }
        const [playlistData, playlistPreviousData, videoData, videoPreviousData] = await Promise.all([
          playlistCurrentResponse.json(),
          playlistPreviousResponse.json(),
          videoCurrentResponse.json(),
          videoPreviousResponse.json(),
        ])
        const sortRows = (rows: PlaylistDailyRow[]) =>
          [...rows].filter((item) => typeof item.day === 'string').sort((a, b) => a.day.localeCompare(b.day))
        const playlistCurrentRows = sortRows((Array.isArray(playlistData.items) ? playlistData.items : []) as PlaylistDailyRow[])
        const playlistPreviousRows = sortRows((Array.isArray(playlistPreviousData.items) ? playlistPreviousData.items : []) as PlaylistDailyRow[])
        const videoCurrentRows = sortRows((Array.isArray(videoData.items) ? videoData.items : []) as PlaylistDailyRow[])
        const videoPreviousRows = sortRows((Array.isArray(videoPreviousData.items) ? videoPreviousData.items : []) as PlaylistDailyRow[])
        setPlaylistDailyRows(playlistCurrentRows)
        setPreviousPlaylistDailyRows(playlistPreviousRows)
        setVideoDailyRows(videoCurrentRows)
        setPreviousVideoDailyRows(videoPreviousRows)
      } catch (err) {
        setAnalyticsError(err instanceof Error ? err.message : 'Failed to load playlist analytics.')
      } finally {
        setAnalyticsLoading(false)
      }
    }

    loadPlaylistAnalytics()
  }, [playlistId, range.start, range.end, previousRange.start, previousRange.end])

  useEffect(() => {
    setDailyRows(viewMode === 'playlist_views' ? playlistDailyRows : videoDailyRows)
    setPreviousDailyRows(viewMode === 'playlist_views' ? previousPlaylistDailyRows : previousVideoDailyRows)
  }, [viewMode, playlistDailyRows, videoDailyRows, previousPlaylistDailyRows, previousVideoDailyRows])

  useEffect(() => {
    async function loadDiscoveryTraffic() {
      if (!playlistId) {
        setDiscoveryTrafficRows([])
        setDiscoveryPreviousTrafficRows([])
        return
      }
      try {
        const currentUrl = `http://127.0.0.1:8000/analytics/playlist-traffic-sources?playlist_id=${playlistId}&start_date=${range.start}&end_date=${range.end}`
        const previousUrl = `http://127.0.0.1:8000/analytics/playlist-traffic-sources?playlist_id=${playlistId}&start_date=${previousRange.start}&end_date=${previousRange.end}`
        const [currentResponse, previousResponse] = await Promise.all([fetch(currentUrl), fetch(previousUrl)])
        if (!currentResponse.ok || !previousResponse.ok) {
          throw new Error('Failed to load playlist discovery traffic data.')
        }
        const [currentPayload, previousPayload] = await Promise.all([currentResponse.json(), previousResponse.json()])
        const toRows = (items: any[]): TrafficSourceRow[] =>
          items.map((item) => ({
            day: String(item?.day ?? ''),
            traffic_source: String(item?.traffic_source ?? ''),
            views: Number(item?.views ?? 0),
            watch_time_minutes: Number(item?.watch_time_minutes ?? 0),
          }))
        setDiscoveryTrafficRows(Array.isArray(currentPayload?.items) ? toRows(currentPayload.items) : [])
        setDiscoveryPreviousTrafficRows(Array.isArray(previousPayload?.items) ? toRows(previousPayload.items) : [])
      } catch (error) {
        console.error('Failed to load playlist discovery traffic data', error)
        setDiscoveryTrafficRows([])
        setDiscoveryPreviousTrafficRows([])
      }
    }
    loadDiscoveryTraffic()
  }, [playlistId, range.start, range.end, previousRange.start, previousRange.end])

  useEffect(() => {
    try {
      const sorted = [...dailyRows]
        .filter((item) => typeof item.day === 'string' && item.day >= range.start && item.day <= range.end)
        .sort((a, b) => a.day.localeCompare(b.day))
      if (sorted.length === 0) {
        setSeries({ views: [], watch_time: [], subscribers: [], revenue: [] })
        setPreviousSeries({ views: [], watch_time: [], subscribers: [], revenue: [] })
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
      const previousByDay = new Map<string, PlaylistDailyRow>()
      previousDailyRows
        .filter((item) => typeof item.day === 'string' && item.day >= previousRange.start && item.day <= previousRange.end)
        .forEach((item) => previousByDay.set(item.day, item))
      const days: string[] = []
      const cursor = new Date(`${sorted[0].day}T00:00:00Z`)
      const end = new Date(`${sorted[sorted.length - 1].day}T00:00:00Z`)
      while (cursor <= end) {
        days.push(cursor.toISOString().slice(0, 10))
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      }
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
      const previousDays: string[] = []
      if (previousDailyRows.length > 0) {
        const previousSortedRows = [...previousDailyRows]
          .filter((item) => typeof item.day === 'string' && item.day >= previousRange.start && item.day <= previousRange.end)
          .sort((a, b) => a.day.localeCompare(b.day))
        if (previousSortedRows.length > 0) {
          const previousCursor = new Date(`${previousSortedRows[0].day}T00:00:00Z`)
          const previousEnd = new Date(`${previousSortedRows[previousSortedRows.length - 1].day}T00:00:00Z`)
          while (previousCursor <= previousEnd) {
            previousDays.push(previousCursor.toISOString().slice(0, 10))
            previousCursor.setUTCDate(previousCursor.getUTCDate() + 1)
          }
        }
      }
      const previousViewsSeries = previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.views ?? 0 }))
      const previousWatchSeries = previousDays.map((day) => ({ date: day, value: Math.round((previousByDay.get(day)?.watch_time_minutes ?? 0) / 60) }))
      const previousSubsSeries = previousDays.map((day) => {
        if (viewMode === 'playlist_views') {
          return { date: day, value: previousByDay.get(day)?.average_view_duration_seconds ?? 0 }
        }
        return {
          date: day,
          value: (previousByDay.get(day)?.subscribers_gained ?? 0) - (previousByDay.get(day)?.subscribers_lost ?? 0),
        }
      })
      const previousRevenueSeries = previousDays.map((day) => ({
        date: day,
        value: viewMode === 'playlist_views'
          ? previousByDay.get(day)?.average_time_in_playlist_seconds ?? 0
          : previousByDay.get(day)?.estimated_revenue ?? 0,
      }))
      setSeries({
        views: viewsSeries,
        watch_time: watchSeries,
        subscribers: subsSeries,
        revenue: revenueSeries,
      })
      setPreviousSeries({
        views: previousViewsSeries,
        watch_time: previousWatchSeries,
        subscribers: previousSubsSeries,
        revenue: previousRevenueSeries,
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
  }, [dailyRows, previousDailyRows, range.start, range.end, previousRange.start, previousRange.end, viewMode])

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
        setPublishedDates(map)
      } catch (error) {
        console.error('Failed to load playlist published dates', error)
      }
    }

    loadPublished()
  }, [playlistId, range.start, range.end])

  const buildTrafficSeries = (
    rows: TrafficSourceRow[],
    metric: 'views' | 'watch_time',
    startDate: string,
    endDate: string
  ): DiscoveryMultiSeries[] => {
    const start = new Date(`${startDate}T00:00:00Z`)
    const end = new Date(`${endDate}T00:00:00Z`)
    const allDays: string[] = []
    const cursor = new Date(start)
    while (cursor <= end) {
      allDays.push(cursor.toISOString().slice(0, 10))
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    const totalsBySource = new Map<string, number>()
    rows.forEach((row) => {
      const source = row.traffic_source
      if (!source) {
        return
      }
      const value = metric === 'views' ? row.views : row.watch_time_minutes
      totalsBySource.set(source, (totalsBySource.get(source) ?? 0) + value)
    })
    const topSources = Array.from(totalsBySource.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([source]) => source)
    const palette = ['#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#ef4444']
    return topSources.map((source, index) => {
      const grouped = new Map<string, number>()
      rows.forEach((row) => {
        if (row.traffic_source !== source || !row.day) {
          return
        }
        const value = metric === 'views' ? row.views : row.watch_time_minutes
        grouped.set(row.day, (grouped.get(row.day) ?? 0) + value)
      })
      const points = allDays.map((date) => ({ date, value: grouped.get(date) ?? 0 }))
      return {
        key: source,
        label: source.replace(/_/g, ' '),
        color: palette[index % palette.length],
        points,
      }
    })
  }

  const discoverySeriesByMetric = useMemo(
    () => ({
      views: buildTrafficSeries(discoveryTrafficRows, 'views', range.start, range.end),
      watch_time: buildTrafficSeries(discoveryTrafficRows, 'watch_time', range.start, range.end),
    }),
    [discoveryTrafficRows, range.start, range.end]
  )

  const previousDiscoverySeriesByMetric = useMemo(
    () => ({
      views: buildTrafficSeries(discoveryPreviousTrafficRows, 'views', previousRange.start, previousRange.end),
      watch_time: buildTrafficSeries(discoveryPreviousTrafficRows, 'watch_time', previousRange.start, previousRange.end),
    }),
    [discoveryPreviousTrafficRows, previousRange.start, previousRange.end]
  )

  const discoveryMetrics = useMemo(() => {
    const totalViews = discoverySeriesByMetric.views.reduce(
      (sum, line) => sum + line.points.reduce((acc, point) => acc + point.value, 0),
      0
    )
    const totalWatch = discoverySeriesByMetric.watch_time.reduce(
      (sum, line) => sum + line.points.reduce((acc, point) => acc + point.value, 0),
      0
    )
    return [
      { key: 'views', label: 'Views', value: formatWholeNumber(Math.round(totalViews)) },
      { key: 'watch_time', label: 'Watch time', value: formatWholeNumber(Math.round(totalWatch)) },
    ]
  }, [discoverySeriesByMetric])

  const trafficShareItems = useMemo<TrafficSourceShareItem[]>(() => {
    const totals = new Map<string, number>()
    discoveryTrafficRows.forEach((row) => {
      if (!row.traffic_source) {
        return
      }
      totals.set(row.traffic_source, (totals.get(row.traffic_source) ?? 0) + (row.views ?? 0))
    })
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([source, views]) => ({ key: source, label: source.replace(/_/g, ' '), views }))
  }, [discoveryTrafficRows])

  const trafficSourceOptions = useMemo(() => {
    return trafficShareItems.map((item) => ({ label: item.label, value: item.key }))
  }, [trafficShareItems])

  useEffect(() => {
    if (!trafficTopSource && trafficSourceOptions.length > 0) {
      setTrafficTopSource(trafficSourceOptions[0].value)
      return
    }
    if (trafficTopSource && !trafficSourceOptions.some((option) => option.value === trafficTopSource)) {
      setTrafficTopSource(trafficSourceOptions[0]?.value ?? '')
    }
  }, [trafficTopSource, trafficSourceOptions])

  useEffect(() => {
    async function loadTopVideosBySource() {
      if (!playlistId || !trafficTopSource) {
        setTrafficTopVideos([])
        setTrafficTopError(null)
        return
      }
      setTrafficTopLoading(true)
      setTrafficTopError(null)
      try {
        const params = new URLSearchParams({
          playlist_id: playlistId,
          start_date: range.start,
          end_date: range.end,
          traffic_source: trafficTopSource,
          limit: '5',
        })
        const response = await fetch(`http://127.0.0.1:8000/analytics/playlist-video-traffic-source-top-videos?${params.toString()}`)
        if (!response.ok) {
          throw new Error(`Failed to load playlist traffic-source videos (${response.status})`)
        }
        const payload = await response.json()
        const entries = (Array.isArray(payload?.items) ? payload.items : []) as TopVideosBySourceResponseItem[]
        setTrafficTopVideos(entries.map((item) => ({
          video_id: String(item.video_id ?? ''),
          title: String(item.title ?? '(untitled)'),
          thumbnail_url: String(item.thumbnail_url ?? ''),
          views: Number(item.views ?? 0),
          watch_time_minutes: Number(item.watch_time_minutes ?? 0),
        })))
      } catch (error) {
        setTrafficTopVideos([])
        setTrafficTopError(error instanceof Error ? error.message : 'Failed to load playlist traffic-source videos.')
      } finally {
        setTrafficTopLoading(false)
      }
    }

    loadTopVideosBySource()
  }, [playlistId, range.start, range.end, trafficTopSource])

  const monetizationSeries = useMemo(() => {
    const sorted = [...videoDailyRows]
      .filter((item) => typeof item.day === 'string' && item.day >= range.start && item.day <= range.end)
      .sort((a, b) => a.day.localeCompare(b.day))
    const byDay = new Map<string, PlaylistDailyRow>()
    sorted.forEach((item) => byDay.set(item.day, item))
    if (sorted.length === 0) {
      return { estimated_revenue: [], ad_impressions: [], monetized_playbacks: [], cpm: [] } as Record<string, SeriesPoint[]>
    }
    const days: string[] = []
    const cursor = new Date(`${sorted[0].day}T00:00:00Z`)
    const end = new Date(`${sorted[sorted.length - 1].day}T00:00:00Z`)
    while (cursor <= end) {
      days.push(cursor.toISOString().slice(0, 10))
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return {
      estimated_revenue: days.map((day) => ({ date: day, value: byDay.get(day)?.estimated_revenue ?? 0 })),
      ad_impressions: days.map((day) => ({ date: day, value: byDay.get(day)?.ad_impressions ?? 0 })),
      monetized_playbacks: days.map((day) => ({ date: day, value: byDay.get(day)?.monetized_playbacks ?? 0 })),
      cpm: days.map((day) => ({ date: day, value: byDay.get(day)?.cpm ?? 0 })),
    }
  }, [videoDailyRows, range.start, range.end])

  const previousMonetizationSeries = useMemo(() => {
    const sorted = [...previousVideoDailyRows]
      .filter((item) => typeof item.day === 'string' && item.day >= previousRange.start && item.day <= previousRange.end)
      .sort((a, b) => a.day.localeCompare(b.day))
    const byDay = new Map<string, PlaylistDailyRow>()
    sorted.forEach((item) => byDay.set(item.day, item))
    if (sorted.length === 0) {
      return { estimated_revenue: [], ad_impressions: [], monetized_playbacks: [], cpm: [] } as Record<string, SeriesPoint[]>
    }
    const days: string[] = []
    const cursor = new Date(`${sorted[0].day}T00:00:00Z`)
    const end = new Date(`${sorted[sorted.length - 1].day}T00:00:00Z`)
    while (cursor <= end) {
      days.push(cursor.toISOString().slice(0, 10))
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return {
      estimated_revenue: days.map((day) => ({ date: day, value: byDay.get(day)?.estimated_revenue ?? 0 })),
      ad_impressions: days.map((day) => ({ date: day, value: byDay.get(day)?.ad_impressions ?? 0 })),
      monetized_playbacks: days.map((day) => ({ date: day, value: byDay.get(day)?.monetized_playbacks ?? 0 })),
      cpm: days.map((day) => ({ date: day, value: byDay.get(day)?.cpm ?? 0 })),
    }
  }, [previousVideoDailyRows, previousRange.start, previousRange.end])

  const monetizationTotals = useMemo(() => {
    const rows = videoDailyRows.filter((item) => typeof item.day === 'string' && item.day >= range.start && item.day <= range.end)
    const adImpressions = rows.reduce((sum, item) => sum + Number(item.ad_impressions ?? 0), 0)
    const cpmWeighted = adImpressions > 0
      ? rows.reduce((sum, item) => sum + Number(item.cpm ?? 0) * Number(item.ad_impressions ?? 0), 0) / adImpressions
      : 0
    return {
      estimated_revenue: rows.reduce((sum, item) => sum + Number(item.estimated_revenue ?? 0), 0),
      ad_impressions: adImpressions,
      monetized_playbacks: rows.reduce((sum, item) => sum + Number(item.monetized_playbacks ?? 0), 0),
      cpm: cpmWeighted,
    }
  }, [videoDailyRows, range.start, range.end])

  const monetizationEarningsLastSixMonths = useMemo<MonetizationMonthly[]>(() => {
    const monthTotals = new Map<string, number>()
    videoDailyRows
      .filter((item) => typeof item.day === 'string' && item.day >= range.start && item.day <= range.end)
      .forEach((item) => {
        const monthKey = item.day.slice(0, 7)
        monthTotals.set(monthKey, (monthTotals.get(monthKey) ?? 0) + Number(item.estimated_revenue ?? 0))
      })
    return Array.from(monthTotals.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6)
      .map(([monthKey, amount]) => {
        const [year, month] = monthKey.split('-')
        const dateValue = new Date(Date.UTC(Number(year), Number(month) - 1, 1))
        return {
          monthKey,
          label: dateValue.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
          amount,
        }
      })
  }, [videoDailyRows, range.start, range.end])

  const monetizationSidePerformance = useMemo<Record<MonetizationContentType, MonetizationPerformance>>(() => {
    const buildPerformance = (items: VideoDetailListItem[]): MonetizationPerformance => {
      const views = items.reduce((sum, item) => sum + Number(item.views ?? 0), 0)
      const estimatedRevenue = Number(monetizationTotals.estimated_revenue ?? 0)
      const rpm = views > 0 ? (estimatedRevenue / views) * 1000 : 0
      const totalItemViews = items.reduce((sum, item) => sum + Math.max(0, Number(item.views ?? 0)), 0)
      const mappedItems: MonetizationTopItem[] = items.map((item) => {
        const itemViews = Math.max(0, Number(item.views ?? 0))
        const share = totalItemViews > 0 ? itemViews / totalItemViews : 0
        return {
          video_id: item.video_id,
          title: item.title,
          thumbnail_url: item.thumbnail_url,
          revenue: estimatedRevenue * share,
        }
      })
      return {
        views,
        estimated_revenue: estimatedRevenue,
        rpm,
        items: mappedItems,
      }
    }

    return {
      video: buildPerformance(topPerformingItems),
      short: buildPerformance(recentPerformingItems),
    }
  }, [topPerformingItems, recentPerformingItems, monetizationTotals.estimated_revenue])

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
              <button
                type="button"
                className={analyticsTab === 'discovery' ? 'analytics-tab active' : 'analytics-tab'}
                onClick={() => setAnalyticsTab('discovery')}
              >
                Discovery
              </button>
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
            ) : analyticsTab === 'metrics' ? (
              <MetricChartCard
                granularity={granularity}
                metrics={[
                  {
                    key: 'views',
                    label: viewMode === 'playlist_views' ? 'Playlist Views' : 'Video Views',
                    value: formatWholeNumber(totals.views),
                  },
                  {
                    key: 'watch_time',
                    label: 'Watch time (hours)',
                    value: formatWholeNumber(Math.round(totals.watch_time_minutes / 60)),
                  },
                  {
                    key: 'subscribers',
                    label: viewMode === 'video_views' ? 'Subscribers' : 'Avg view duration',
                    value: viewMode === 'video_views'
                      ? formatWholeNumber(totals.subscribers_net)
                      : formatDurationSeconds(totals.average_view_duration_seconds),
                  },
                  {
                    key: 'revenue',
                    label: viewMode === 'video_views' ? 'Estimated revenue' : 'Avg time in playlist',
                    value: viewMode === 'video_views'
                      ? formatCurrency(totals.estimated_revenue)
                      : formatDurationSeconds(totals.average_time_in_playlist_seconds),
                  },
                ]}
                series={{
                  views: series.views ?? [],
                  watch_time: series.watch_time ?? [],
                  subscribers: series.subscribers ?? [],
                  revenue: series.revenue ?? [],
                }}
                previousSeries={{
                  views: previousSeries.views ?? [],
                  watch_time: previousSeries.watch_time ?? [],
                  subscribers: previousSeries.subscribers ?? [],
                  revenue: previousSeries.revenue ?? [],
                }}
                publishedDates={publishedDates}
              />
            ) : analyticsTab === 'monetization' ? (
              <MetricChartCard
                granularity={granularity}
                metrics={[
                  { key: 'estimated_revenue', label: 'Estimated revenue', value: formatCurrency(monetizationTotals.estimated_revenue) },
                  { key: 'ad_impressions', label: 'Ad impressions', value: formatWholeNumber(monetizationTotals.ad_impressions) },
                  { key: 'monetized_playbacks', label: 'Monetized playbacks', value: formatWholeNumber(monetizationTotals.monetized_playbacks) },
                  { key: 'cpm', label: 'CPM', value: formatCurrency(monetizationTotals.cpm) },
                ]}
                series={{
                  estimated_revenue: monetizationSeries.estimated_revenue ?? [],
                  ad_impressions: monetizationSeries.ad_impressions ?? [],
                  monetized_playbacks: monetizationSeries.monetized_playbacks ?? [],
                  cpm: monetizationSeries.cpm ?? [],
                }}
                previousSeries={{
                  estimated_revenue: previousMonetizationSeries.estimated_revenue ?? [],
                  ad_impressions: previousMonetizationSeries.ad_impressions ?? [],
                  monetized_playbacks: previousMonetizationSeries.monetized_playbacks ?? [],
                  cpm: previousMonetizationSeries.cpm ?? [],
                }}
                comparisonAggregation={{ cpm: 'avg' }}
                publishedDates={publishedDates}
              />
            ) : (
              <MetricChartCard
                granularity={granularity}
                metrics={discoveryMetrics}
                series={{}}
                multiSeriesByMetric={discoverySeriesByMetric}
                previousMultiSeriesByMetric={previousDiscoverySeriesByMetric}
                publishedDates={publishedDates}
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
              {analyticsTab === 'monetization' ? (
                <>
                  <PageCard>
                    <MonetizationEarningsCard items={monetizationEarningsLastSixMonths} />
                  </PageCard>
                  <PageCard>
                    <MonetizationContentPerformanceCard
                      contentType={monetizationContentType}
                      onContentTypeChange={setMonetizationContentType}
                      performance={monetizationSidePerformance}
                      itemCount={7}
                      onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
                    />
                  </PageCard>
                </>
              ) : analyticsTab === 'discovery' ? (
                <>
                  <PageCard>
                    <TrafficSourceShareCard items={trafficShareItems} />
                  </PageCard>
                  <PageCard>
                    <TrafficSourceTopVideosCard
                      source={trafficTopSource}
                      sourceOptions={trafficSourceOptions}
                      items={trafficTopVideos}
                      loading={trafficTopLoading}
                      error={trafficTopError}
                      onSourceChange={setTrafficTopSource}
                      onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
                    />
                  </PageCard>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default PlaylistDetail

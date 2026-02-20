import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ActionButton, PageSizePicker, PageSwitcher } from '../../components/ui'
import { CommentFilter, DataRangeControl, type CommentSort } from '../../components/features'
import { MetricChartCard } from '../../components/charts'
import {
  CommentsWordCloudCard,
  LlmSummaryCard,
  PageCard,
  SearchInsightsTopTermsCard,
  TrafficSourceShareCard,
  type SearchInsightsTopTerm,
  type TrafficSourceShareItem,
} from '../../components/cards'
import { CommentThreadItem, type CommentRow } from '../../components/tables'
import usePagination from '../../hooks/usePagination'
import { formatDisplayDate } from '../../utils/date'
import { formatCurrency, formatWholeNumber } from '../../utils/number'
import { getStored, setStored } from '../../utils/storage'
import '../shared.css'
import './VideoDetail.css'

type VideoMetadata = {
  id: string
  title: string
  description: string | null
  published_at: string | null
  view_count: number | null
  like_count: number | null
  comment_count: number | null
  privacy_status: string | null
  duration_seconds: number | null
  thumbnail_url: string | null
  content_type: string | null
}

type VideoDailyRow = {
  date: string
  views: number | null
  watch_time_minutes: number | null
  average_view_duration_seconds: number | null
  estimated_revenue: number | null
  ad_impressions: number | null
  monetized_playbacks: number | null
  cpm: number | null
  subscribers_gained: number | null
  subscribers_lost: number | null
}

type SeriesPoint = { date: string; value: number }
type Granularity = 'daily' | '7d' | '28d' | '90d' | 'monthly' | 'yearly'
type SummarySort = 'recency' | 'like_count'
type WordType = 'noun' | 'verb' | 'proper_noun' | 'adjective' | 'adverb'
type DiscoveryMetric = 'views' | 'watch_time'
type VideoDetailTab = 'analytics' | 'monetization' | 'discovery' | 'comments'
type TrafficSourceRow = {
  day: string
  traffic_source: string
  views: number
  watch_time_minutes: number
}
type DiscoveryMultiSeries = {
  key: string
  label: string
  color: string
  points: SeriesPoint[]
}
type TopSearchResponseItem = {
  search_term: string
  views: number
  watch_time_minutes: number
  video_count: number
}
const GRANULARITY_OPTIONS = [
  { label: 'Daily', value: 'daily' },
  { label: '7-days', value: '7d' },
  { label: '28-days', value: '28d' },
  { label: '90-days', value: '90d' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Yearly', value: 'yearly' },
]
const WORD_TYPE_OPTIONS: Array<{ label: string; value: WordType }> = [
  { label: 'Nouns', value: 'noun' },
  { label: 'Verbs', value: 'verb' },
  { label: 'Proper nouns', value: 'proper_noun' },
  { label: 'Adjectives', value: 'adjective' },
  { label: 'Adverbs', value: 'adverb' },
]
const DEFAULT_WORD_TYPES: WordType[] = ['noun', 'verb', 'proper_noun', 'adjective', 'adverb']

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds < 0) {
    return '-'
  }
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remSeconds = seconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remSeconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(remSeconds).padStart(2, '0')}`
}

function buildTrafficSeries(
  rows: TrafficSourceRow[],
  metric: DiscoveryMetric,
  startDate: string,
  endDate: string
): DiscoveryMultiSeries[] {
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
    if (!row.traffic_source) {
      return
    }
    const value = metric === 'views' ? row.views : row.watch_time_minutes
    totalsBySource.set(row.traffic_source, (totalsBySource.get(row.traffic_source) ?? 0) + value)
  })
  const topSources = Array.from(totalsBySource.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([source]) => source)
  const colorPalette = ['#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#ef4444']
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
      color: colorPalette[index % colorPalette.length],
      points,
    }
  })
}

function VideoDetail() {
  const { videoId } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<VideoDetailTab>(getStored('videoDetailTab', 'analytics'))
  const [video, setVideo] = useState<VideoMetadata | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsError, setCommentsError] = useState<string | null>(null)
  const [comments, setComments] = useState<CommentRow[]>([])
  const [commentsTotal, setCommentsTotal] = useState(0)
  const {
    page: commentsPage,
    setPage: setCommentsPage,
    pageSize: commentsPageSize,
    setPageSize: setCommentsPageSize,
    totalPages: commentsTotalPages,
  } = usePagination({ total: commentsTotal, defaultPageSize: 10 })
  const [commentsSort, setCommentsSort] = useState<CommentSort>(getStored('videoDetailCommentsSort', 'published_at'))
  const [commentsSearchText, setCommentsSearchText] = useState(getStored('videoDetailCommentsSearchText', ''))
  const [commentsPostedAfter, setCommentsPostedAfter] = useState(getStored('videoDetailCommentsPostedAfter', ''))
  const [commentsPostedBefore, setCommentsPostedBefore] = useState(getStored('videoDetailCommentsPostedBefore', ''))
  const [wordTypes, setWordTypes] = useState<WordType[]>(DEFAULT_WORD_TYPES)
  const [wordCloudImageUrl, setWordCloudImageUrl] = useState('')
  const [wordCloudLoading, setWordCloudLoading] = useState(false)
  const [wordCloudError, setWordCloudError] = useState<string | null>(null)
  const [summaryLimitInput, setSummaryLimitInput] = useState('50')
  const [summarySortBy, setSummarySortBy] = useState<SummarySort>('recency')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [summaryText, setSummaryText] = useState('')
  const [dailyRows, setDailyRows] = useState<VideoDailyRow[]>([])
  const [years, setYears] = useState<string[]>([])
  const rangeOptions = [
    { label: 'Last 7 days', value: 'range:7d' },
    { label: 'Last 28 days', value: 'range:28d' },
    { label: 'Last 90 days', value: 'range:90d' },
    { label: 'Last 365 days', value: 'range:365d' },
    { label: 'Full data', value: 'full' },
  ]
  const storedRange = getStored('videoDetailRange', null as {
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
  const [granularity, setGranularity] = useState<Granularity>(getStored('videoDetailGranularity', 'daily'))
  const [series, setSeries] = useState<Record<string, SeriesPoint[]>>({})
  const [previousSeries, setPreviousSeries] = useState<Record<string, SeriesPoint[]>>({})
  const [monetizationSeries, setMonetizationSeries] = useState<Record<string, SeriesPoint[]>>({})
  const [previousMonetizationSeries, setPreviousMonetizationSeries] = useState<Record<string, SeriesPoint[]>>({})
  const [discoveryTrafficRows, setDiscoveryTrafficRows] = useState<TrafficSourceRow[]>([])
  const [discoveryPreviousTrafficRows, setDiscoveryPreviousTrafficRows] = useState<TrafficSourceRow[]>([])
  const [searchTopTerms, setSearchTopTerms] = useState<SearchInsightsTopTerm[]>([])
  const [searchTopTermsLoading, setSearchTopTermsLoading] = useState(false)
  const [searchTopTermsError, setSearchTopTermsError] = useState<string | null>(null)
  const [totals, setTotals] = useState({
    views: 0,
    watch_time_minutes: 0,
    average_view_duration_seconds: 0,
    estimated_revenue: 0,
  })
  const [monetizationTotals, setMonetizationTotals] = useState({
    estimated_revenue: 0,
    ad_impressions: 0,
    monetized_playbacks: 0,
    cpm: 0,
  })
  const summaryLimit = useMemo(() => {
    const parsed = Number(summaryLimitInput)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null
    }
    return Math.floor(parsed)
  }, [summaryLimitInput])
  const commentThreads = useMemo(() => {
    const parseTime = (value: string | null) => (value ? new Date(value).getTime() : 0)
    const parseLikes = (value: number | null) => value ?? 0
    const parseReplyCount = (value: number | null | undefined) => value ?? 0
    const compareComments = (a: CommentRow, b: CommentRow) => {
      if (commentsSort === 'likes') {
        return parseLikes(b.like_count) - parseLikes(a.like_count)
      }
      if (commentsSort === 'reply_count') {
        return parseReplyCount(b.reply_count) - parseReplyCount(a.reply_count)
      }
        return parseTime(b.published_at) - parseTime(a.published_at)
    }
    return comments
      .sort(compareComments)
      .map((comment) => ({
        parent: comment,
        replies: [],
        repliesTotal: comment.reply_count ?? 0,
      }))
  }, [comments, commentsSort])
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
    }
  }, [range.start, range.end])

  useEffect(() => {
    async function loadVideo() {
      if (!videoId) {
        setVideo(null)
        setError('Missing video ID.')
        return
      }
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`http://127.0.0.1:8000/videos/${videoId}`)
        if (!response.ok) {
          throw new Error(`Failed to load video (${response.status})`)
        }
        const data = await response.json()
        setVideo((data.item ?? null) as VideoMetadata | null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load video.')
      } finally {
        setLoading(false)
      }
    }

    loadVideo()
  }, [videoId])

  useEffect(() => {
    setCommentsPage(1)
  }, [videoId, activeTab])

  useEffect(() => {
    setStored('videoDetailRange', {
      mode,
      presetSelection,
      yearSelection,
      monthSelection,
      customStart,
      customEnd,
    })
  }, [mode, presetSelection, yearSelection, monthSelection, customStart, customEnd])

  useEffect(() => {
    setStored('videoDetailTab', activeTab)
  }, [activeTab])

  useEffect(() => {
    setStored('videoDetailGranularity', granularity)
  }, [granularity])

  useEffect(() => {
    setStored('videoDetailCommentsSort', commentsSort)
  }, [commentsSort])

  useEffect(() => {
    setStored('videoDetailCommentsSearchText', commentsSearchText)
  }, [commentsSearchText])

  useEffect(() => {
    setStored('videoDetailCommentsPostedAfter', commentsPostedAfter)
  }, [commentsPostedAfter])

  useEffect(() => {
    setStored('videoDetailCommentsPostedBefore', commentsPostedBefore)
  }, [commentsPostedBefore])

  useEffect(() => {
    async function loadVideoAnalytics() {
      if (!videoId) {
        setDailyRows([])
        setYears([])
        setSeries({ views: [], watch_time: [], avg_duration: [], revenue: [] })
        setPreviousSeries({ views: [], watch_time: [], avg_duration: [], revenue: [] })
        setTotals({ views: 0, watch_time_minutes: 0, average_view_duration_seconds: 0, estimated_revenue: 0 })
        setMonetizationSeries({ estimated_revenue: [], ad_impressions: [], monetized_playbacks: [] })
        setPreviousMonetizationSeries({ estimated_revenue: [], ad_impressions: [], monetized_playbacks: [], cpm: [] })
        setMonetizationTotals({ estimated_revenue: 0, ad_impressions: 0, monetized_playbacks: 0, cpm: 0 })
        setAnalyticsError('Missing video ID.')
        return
      }
      setAnalyticsLoading(true)
      setAnalyticsError(null)
      try {
        const response = await fetch(`http://127.0.0.1:8000/analytics/video-daily?video_id=${videoId}&limit=10000`)
        if (!response.ok) {
          throw new Error(`Failed to load analytics (${response.status})`)
        }
        const data = await response.json()
        const items = (Array.isArray(data.items) ? data.items : []) as VideoDailyRow[]
        const sorted = [...items]
          .filter((item) => typeof item.date === 'string')
          .sort((a, b) => a.date.localeCompare(b.date))
        setDailyRows(sorted)
        const minDate = sorted[0]?.date
        const maxDate = sorted[sorted.length - 1]?.date
        if (minDate && maxDate) {
          const minYear = parseInt(minDate.slice(0, 4), 10)
          const maxYear = parseInt(maxDate.slice(0, 4), 10)
          setYears(Array.from({ length: maxYear - minYear + 1 }, (_, idx) => String(maxYear - idx)))
        } else {
          setYears([])
        }
        if (sorted.length === 0) {
          setSeries({ views: [], watch_time: [], avg_duration: [], revenue: [] })
          setTotals({ views: 0, watch_time_minutes: 0, average_view_duration_seconds: 0, estimated_revenue: 0 })
          setPreviousSeries({ views: [], watch_time: [], avg_duration: [], revenue: [] })
          setMonetizationSeries({ estimated_revenue: [], ad_impressions: [], monetized_playbacks: [] })
          setPreviousMonetizationSeries({ estimated_revenue: [], ad_impressions: [], monetized_playbacks: [], cpm: [] })
          setMonetizationTotals({ estimated_revenue: 0, ad_impressions: 0, monetized_playbacks: 0, cpm: 0 })
          return
        }
      } catch (err) {
        setAnalyticsError(err instanceof Error ? err.message : 'Failed to load analytics.')
      } finally {
        setAnalyticsLoading(false)
      }
    }

    loadVideoAnalytics()
  }, [videoId])

  useEffect(() => {
    if (mode === 'year' && !yearSelection && years.length > 0) {
      setYearSelection(years[0])
    }
  }, [mode, yearSelection, years])

  useEffect(() => {
    try {
      const sorted = [...dailyRows]
        .filter((item) => typeof item.date === 'string' && item.date >= range.start && item.date <= range.end)
        .sort((a, b) => a.date.localeCompare(b.date))
      const previousSorted = [...dailyRows]
        .filter((item) => typeof item.date === 'string' && item.date >= previousRange.start && item.date <= previousRange.end)
        .sort((a, b) => a.date.localeCompare(b.date))
        if (sorted.length === 0) {
          setSeries({ views: [], watch_time: [], avg_duration: [], revenue: [] })
          setPreviousSeries({ views: [], watch_time: [], avg_duration: [], revenue: [] })
          setTotals({ views: 0, watch_time_minutes: 0, average_view_duration_seconds: 0, estimated_revenue: 0 })
          setPreviousMonetizationSeries({ estimated_revenue: [], ad_impressions: [], monetized_playbacks: [], cpm: [] })
          return
        }
        const byDay = new Map<string, VideoDailyRow>()
        sorted.forEach((item) => byDay.set(item.date, item))
        const days: string[] = []
        const cursor = new Date(`${sorted[0].date}T00:00:00Z`)
        const end = new Date(`${sorted[sorted.length - 1].date}T00:00:00Z`)
        while (cursor <= end) {
          days.push(cursor.toISOString().slice(0, 10))
          cursor.setUTCDate(cursor.getUTCDate() + 1)
        }
        const viewsSeries = days.map((day) => ({ date: day, value: byDay.get(day)?.views ?? 0 }))
        const watchSeries = days.map((day) => ({ date: day, value: Math.round((byDay.get(day)?.watch_time_minutes ?? 0) / 60) }))
        const avgDurationSeries = days.map((day) => ({ date: day, value: byDay.get(day)?.average_view_duration_seconds ?? 0 }))
        const revenueSeries = days.map((day) => ({ date: day, value: byDay.get(day)?.estimated_revenue ?? 0 }))
        const adImpressionsSeries = days.map((day) => ({ date: day, value: byDay.get(day)?.ad_impressions ?? 0 }))
        const monetizedPlaybacksSeries = days.map((day) => ({ date: day, value: byDay.get(day)?.monetized_playbacks ?? 0 }))
        const cpmSeries = days.map((day) => ({ date: day, value: byDay.get(day)?.cpm ?? 0 }))

        const totalViews = sorted.reduce((sum, item) => sum + (item.views ?? 0), 0)
        const totalWatchMinutes = sorted.reduce((sum, item) => sum + (item.watch_time_minutes ?? 0), 0)
        const totalAverageViewDurationSeconds = sorted.reduce(
          (sum, item) => sum + (item.average_view_duration_seconds ?? 0),
          0
        ) / Math.max(sorted.length, 1)
        const totalRevenue = sorted.reduce((sum, item) => sum + (item.estimated_revenue ?? 0), 0)
        const totalAdImpressions = sorted.reduce((sum, item) => sum + (item.ad_impressions ?? 0), 0)
        const totalMonetizedPlaybacks = sorted.reduce((sum, item) => sum + (item.monetized_playbacks ?? 0), 0)
        const totalCpmWeighted = sorted.reduce((sum, item) => {
          const cpm = item.cpm ?? 0
          const impressions = item.ad_impressions ?? 0
          return sum + cpm * impressions
        }, 0)
        const totalCpm = totalAdImpressions > 0
          ? totalCpmWeighted / totalAdImpressions
          : (sorted.reduce((sum, item) => sum + (item.cpm ?? 0), 0) / Math.max(sorted.length, 1))

        const previousByDay = new Map<string, VideoDailyRow>()
        previousSorted.forEach((item) => previousByDay.set(item.date, item))
        const previousDays: string[] = []
        if (previousSorted.length > 0) {
          const previousCursor = new Date(`${previousSorted[0].date}T00:00:00Z`)
          const previousEnd = new Date(`${previousSorted[previousSorted.length - 1].date}T00:00:00Z`)
          while (previousCursor <= previousEnd) {
            previousDays.push(previousCursor.toISOString().slice(0, 10))
            previousCursor.setUTCDate(previousCursor.getUTCDate() + 1)
          }
        }
        const previousViewsSeries = previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.views ?? 0 }))
        const previousWatchSeries = previousDays.map((day) => ({ date: day, value: Math.round((previousByDay.get(day)?.watch_time_minutes ?? 0) / 60) }))
        const previousAvgDurationSeries = previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.average_view_duration_seconds ?? 0 }))
        const previousRevenueSeries = previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.estimated_revenue ?? 0 }))
        const previousAdImpressionsSeries = previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.ad_impressions ?? 0 }))
        const previousMonetizedPlaybacksSeries = previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.monetized_playbacks ?? 0 }))
        const previousCpmSeries = previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.cpm ?? 0 }))

        setSeries({
          views: viewsSeries,
          watch_time: watchSeries,
          avg_duration: avgDurationSeries,
          revenue: revenueSeries,
        })
        setTotals({
          views: totalViews,
          watch_time_minutes: totalWatchMinutes,
          average_view_duration_seconds: totalAverageViewDurationSeconds,
          estimated_revenue: totalRevenue,
        })
        setPreviousSeries({
          views: previousViewsSeries,
          watch_time: previousWatchSeries,
          avg_duration: previousAvgDurationSeries,
          revenue: previousRevenueSeries,
        })
        setMonetizationSeries({
          estimated_revenue: revenueSeries,
          ad_impressions: adImpressionsSeries,
          monetized_playbacks: monetizedPlaybacksSeries,
          cpm: cpmSeries,
        })
        setMonetizationTotals({
          estimated_revenue: totalRevenue,
          ad_impressions: totalAdImpressions,
          monetized_playbacks: totalMonetizedPlaybacks,
          cpm: totalCpm,
        })
        setPreviousMonetizationSeries({
          estimated_revenue: previousRevenueSeries,
          ad_impressions: previousAdImpressionsSeries,
          monetized_playbacks: previousMonetizedPlaybacksSeries,
          cpm: previousCpmSeries,
        })
    } catch (err) {
      setAnalyticsError(err instanceof Error ? err.message : 'Failed to process analytics.')
    }
  }, [dailyRows, range.start, range.end, previousRange.start, previousRange.end])

  useEffect(() => {
    async function loadDiscoveryTraffic() {
      if (!videoId) {
        setDiscoveryTrafficRows([])
        setDiscoveryPreviousTrafficRows([])
        return
      }
      try {
        const [currentResponse, previousResponse] = await Promise.all([
          fetch(`http://127.0.0.1:8000/analytics/video-traffic-sources?start_date=${range.start}&end_date=${range.end}&video_id=${videoId}`),
          fetch(`http://127.0.0.1:8000/analytics/video-traffic-sources?start_date=${previousRange.start}&end_date=${previousRange.end}&video_id=${videoId}`),
        ])
        const [currentData, previousData] = await Promise.all([currentResponse.json(), previousResponse.json()])
        const toRows = (items: any[]): TrafficSourceRow[] =>
          items.map((item) => ({
            day: String(item?.day ?? ''),
            traffic_source: String(item?.traffic_source ?? ''),
            views: Number(item?.views ?? 0),
            watch_time_minutes: Number(item?.watch_time_minutes ?? 0),
          }))
        setDiscoveryTrafficRows(Array.isArray(currentData?.items) ? toRows(currentData.items) : [])
        setDiscoveryPreviousTrafficRows(Array.isArray(previousData?.items) ? toRows(previousData.items) : [])
      } catch {
        setDiscoveryTrafficRows([])
        setDiscoveryPreviousTrafficRows([])
      }
    }

    loadDiscoveryTraffic()
  }, [videoId, range.start, range.end, previousRange.start, previousRange.end])

  useEffect(() => {
    async function loadTopSearchTerms() {
      if (!videoId || activeTab !== 'discovery') {
        return
      }
      setSearchTopTermsLoading(true)
      setSearchTopTermsError(null)
      try {
        const params = new URLSearchParams({
          start_date: range.start,
          end_date: range.end,
          video_ids: videoId,
        })
        const response = await fetch(`http://127.0.0.1:8000/analytics/video-search-insights?${params.toString()}`)
        if (!response.ok) {
          throw new Error(`Failed to load top search terms (${response.status})`)
        }
        const payload = await response.json()
        const items = (Array.isArray(payload?.items) ? payload.items : []) as TopSearchResponseItem[]
        setSearchTopTerms(
          items.map((item) => ({
            search_term: String(item.search_term ?? ''),
            views: Number(item.views ?? 0),
            watch_time_minutes: Number(item.watch_time_minutes ?? 0),
            video_count: Number(item.video_count ?? 0),
          }))
        )
      } catch (loadError) {
        setSearchTopTerms([])
        setSearchTopTermsError(loadError instanceof Error ? loadError.message : 'Failed to load top search terms.')
      } finally {
        setSearchTopTermsLoading(false)
      }
    }

    loadTopSearchTerms()
  }, [videoId, activeTab, range.start, range.end])

  const discoverySeriesByMetric = useMemo<Record<DiscoveryMetric, DiscoveryMultiSeries[]>>(
    () => ({
      views: buildTrafficSeries(discoveryTrafficRows, 'views', range.start, range.end),
      watch_time: buildTrafficSeries(discoveryTrafficRows, 'watch_time', range.start, range.end),
    }),
    [discoveryTrafficRows, range.start, range.end]
  )

  const previousDiscoverySeriesByMetric = useMemo<Record<DiscoveryMetric, DiscoveryMultiSeries[]>>(
    () => ({
      views: buildTrafficSeries(discoveryPreviousTrafficRows, 'views', previousRange.start, previousRange.end),
      watch_time: buildTrafficSeries(discoveryPreviousTrafficRows, 'watch_time', previousRange.start, previousRange.end),
    }),
    [discoveryPreviousTrafficRows, previousRange.start, previousRange.end]
  )

  const discoveryMetrics = useMemo(() => {
    const totalViews = discoverySeriesByMetric.views.reduce((sum, line) => sum + line.points.reduce((acc, point) => acc + point.value, 0), 0)
    const totalWatch = discoverySeriesByMetric.watch_time.reduce((sum, line) => sum + line.points.reduce((acc, point) => acc + point.value, 0), 0)
    return [
      { key: 'views', label: 'Views', value: formatWholeNumber(Math.round(totalViews)) },
      { key: 'watch_time', label: 'Watch time', value: formatWholeNumber(Math.round(totalWatch)) },
    ]
  }, [discoverySeriesByMetric])

  const discoveryShareItems = useMemo<TrafficSourceShareItem[]>(() => {
    const totals = new Map<string, number>()
    discoveryTrafficRows.forEach((row) => {
      if (!row.traffic_source) {
        return
      }
      totals.set(row.traffic_source, (totals.get(row.traffic_source) ?? 0) + row.views)
    })
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([source, views]) => ({ key: source, label: source.replace(/_/g, ' '), views }))
  }, [discoveryTrafficRows])

  useEffect(() => {
    async function loadComments() {
      if (!videoId || activeTab !== 'comments') {
        return
      }
      setCommentsLoading(true)
      setCommentsError(null)
      try {
        const offset = (commentsPage - 1) * commentsPageSize
        const params = new URLSearchParams({
          video_id: videoId,
          limit: String(commentsPageSize),
          offset: String(offset),
          sort_by: commentsSort,
          direction: 'desc',
        })
        if (commentsSearchText.trim()) {
          params.set('q', commentsSearchText.trim())
        }
        if (commentsPostedAfter) {
          params.set('published_after', commentsPostedAfter)
        }
        if (commentsPostedBefore) {
          params.set('published_before', commentsPostedBefore)
        }
        const response = await fetch(`http://127.0.0.1:8000/comments?${params.toString()}`)
        if (!response.ok) {
          throw new Error(`Failed to load comments (${response.status})`)
        }
        const data = await response.json()
        setComments(Array.isArray(data.items) ? (data.items as CommentRow[]) : [])
        setCommentsTotal(typeof data.total === 'number' ? data.total : 0)
      } catch (err) {
        setCommentsError(err instanceof Error ? err.message : 'Failed to load comments.')
      } finally {
        setCommentsLoading(false)
      }
    }

    loadComments()
  }, [videoId, activeTab, commentsPage, commentsPageSize, commentsSort, commentsSearchText, commentsPostedAfter, commentsPostedBefore])

  useEffect(() => {
    setCommentsPage(1)
  }, [commentsSort, commentsSearchText, commentsPostedAfter, commentsPostedBefore])

  useEffect(() => {
    setSummaryText('')
    setSummaryError(null)
  }, [videoId, commentsSearchText, commentsPostedAfter, commentsPostedBefore, summarySortBy, summaryLimitInput])

  useEffect(() => {
    return () => {
      if (wordCloudImageUrl) {
        URL.revokeObjectURL(wordCloudImageUrl)
      }
    }
  }, [wordCloudImageUrl])

  const summarizeVideoComments = async () => {
    if (!videoId) {
      setSummaryError('Missing video ID.')
      return
    }
    setSummaryLoading(true)
    setSummaryError(null)
    try {
      const payload: {
        q: string | null
        video_id: string
        published_after: string | null
        published_before: string | null
        sort_by: SummarySort
        limit_count?: number
      } = {
        q: commentsSearchText.trim() || null,
        video_id: videoId,
        published_after: commentsPostedAfter || null,
        published_before: commentsPostedBefore || null,
        sort_by: summarySortBy,
      }
      if (summaryLimit !== null) {
        payload.limit_count = summaryLimit
      }
      const response = await fetch('http://127.0.0.1:8000/llm/summarize-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json()
      if (!response.ok) {
        throw new Error(typeof body.detail === 'string' ? body.detail : `Failed to summarize comments (${response.status})`)
      }
      setSummaryText(typeof body.summary === 'string' ? body.summary : '')
    } catch (err) {
      setSummaryText('')
      setSummaryError(err instanceof Error ? err.message : 'Failed to summarize comments.')
    } finally {
      setSummaryLoading(false)
    }
  }

  const generateVideoWordCloud = async () => {
    if (!videoId || activeTab !== 'comments') {
      return
    }
    setWordCloudLoading(true)
    setWordCloudError(null)
    try {
      const params = new URLSearchParams()
      params.set('video_id', videoId)
      params.set('max_words', '120')
      params.set('min_count', '2')
      if (commentsPostedAfter) {
        params.set('published_after', commentsPostedAfter)
      }
      if (commentsPostedBefore) {
        params.set('published_before', commentsPostedBefore)
      }
      if (commentsSearchText.trim()) {
        params.set('q', commentsSearchText.trim())
      }
      if (wordTypes.length > 0) {
        params.set('word_types', wordTypes.join(','))
      }
      const response = await fetch(`http://127.0.0.1:8000/comments/word-cloud/image?${params.toString()}`)
      if (!response.ok) {
        throw new Error(`Failed to build word cloud (${response.status})`)
      }
      const blob = await response.blob()
      const nextObjectUrl = URL.createObjectURL(blob)
      setWordCloudImageUrl((previousUrl) => {
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl)
        }
        return nextObjectUrl
      })
    } catch (err) {
      setWordCloudImageUrl('')
      setWordCloudError(err instanceof Error ? err.message : 'Failed to build word cloud.')
    } finally {
      setWordCloudLoading(false)
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div className="header-inline-title">
          <ActionButton label="<" onClick={() => navigate(-1)} variant="soft" bordered={false} className="header-back-action" />
          <h1>Video</h1>
        </div>
      </header>
      <div className="page-body">
        <div className="page-row">
          <PageCard>
            {loading ? (
              <div className="video-detail-state">Loading video metadata...</div>
            ) : error ? (
              <div className="video-detail-state">{error}</div>
            ) : video ? (
              <div className="video-detail-layout">
                <div className="video-detail-meta">
                  {video.thumbnail_url ? (
                    <img className="video-detail-thumb" src={video.thumbnail_url} alt={video.title} />
                  ) : (
                    <div className="video-detail-thumb" />
                  )}
                  <div className="video-detail-meta-content">
                    <div className="video-detail-title">{video.title || '(untitled)'}</div>
                    <div className="video-detail-description">{video.description || '-'}</div>
                  </div>
                </div>
                <div className="video-detail-grid">
                  <div className="video-detail-item">
                    <span>Visibility</span>
                    <strong>{video.privacy_status || '-'}</strong>
                  </div>
                  <div className="video-detail-item">
                    <span>Published</span>
                    <strong>{formatDisplayDate(video.published_at)}</strong>
                  </div>
                  <div className="video-detail-item">
                    <span>Duration</span>
                    <strong>{formatDuration(video.duration_seconds)}</strong>
                  </div>
                  <div className="video-detail-item">
                    <span>Views</span>
                    <strong>{(video.view_count ?? 0).toLocaleString()}</strong>
                  </div>
                  <div className="video-detail-item">
                    <span>Likes</span>
                    <strong>{(video.like_count ?? 0).toLocaleString()}</strong>
                  </div>
                  <div className="video-detail-item">
                    <span>Comments</span>
                    <strong>{(video.comment_count ?? 0).toLocaleString()}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="video-detail-state">Video metadata</div>
            )}
          </PageCard>
        </div>
        <div className="page-row">
          <div className="video-detail-toolbar">
            <div className="analytics-range-controls">
              <ActionButton
                label="Metrics"
                onClick={() => setActiveTab('analytics')}
                variant="soft"
                active={activeTab === 'analytics'}
              />
              <ActionButton
                label="Monetization"
                onClick={() => setActiveTab('monetization')}
                variant="soft"
                active={activeTab === 'monetization'}
              />
              <ActionButton
                label="Discovery"
                onClick={() => setActiveTab('discovery')}
                variant="soft"
                active={activeTab === 'discovery'}
              />
              <ActionButton
                label="Comments"
                onClick={() => setActiveTab('comments')}
                variant="soft"
                active={activeTab === 'comments'}
              />
            </div>
            {activeTab === 'analytics' || activeTab === 'monetization' || activeTab === 'discovery' ? (
              <div className="analytics-range-controls">
                <DataRangeControl
                  granularity={granularity}
                  onGranularityChange={(value) => setGranularity(value as Granularity)}
                  mode={mode}
                  onModeChange={(value) => setMode(value)}
                  presetSelection={presetSelection}
                  onPresetSelectionChange={setPresetSelection}
                  yearSelection={yearSelection}
                  onYearSelectionChange={setYearSelection}
                  monthSelection={monthSelection}
                  onMonthSelectionChange={setMonthSelection}
                  customStart={customStart}
                  customEnd={customEnd}
                  onCustomRangeChange={(nextStart, nextEnd) => {
                    setCustomStart(nextStart)
                    setCustomEnd(nextEnd)
                  }}
                  years={years}
                  rangeOptions={rangeOptions}
                  granularityOptions={GRANULARITY_OPTIONS}
                  presetPlaceholder="Full data"
                />
              </div>
            ) : null}
          </div>
        </div>
        {activeTab === 'comments' ? (
          <div className="page-row">
            <PageCard>
              <CommentFilter
                showTitle
                searchText={commentsSearchText}
                onSearchTextChange={setCommentsSearchText}
                postedAfter={commentsPostedAfter}
                postedBefore={commentsPostedBefore}
                onDateRangeChange={(startDate, endDate) => {
                  setCommentsPostedAfter(startDate)
                  setCommentsPostedBefore(endDate)
                }}
                sortBy={commentsSort}
                onSortByChange={setCommentsSort}
                onReset={() => {
                  setCommentsSearchText('')
                  setCommentsPostedAfter('')
                  setCommentsPostedBefore('')
                  setCommentsSort('published_at')
                }}
              />
            </PageCard>
          </div>
        ) : null}
        <div className="page-row">
          {activeTab === 'comments' ? (
            <div className="video-comments-insights-grid">
              <PageCard>
                <LlmSummaryCard
                  loading={summaryLoading}
                  error={summaryError}
                  summary={summaryText}
                  maxComments={summaryLimitInput}
                  onMaxCommentsChange={setSummaryLimitInput}
                  rankBy={summarySortBy}
                  onRankByChange={setSummarySortBy}
                  onSummarize={summarizeVideoComments}
                  disabled={commentsTotal === 0}
                />
              </PageCard>
              <PageCard>
                <CommentsWordCloudCard
                  imageUrl={wordCloudImageUrl}
                  loading={wordCloudLoading}
                  error={wordCloudError}
                  wordTypeOptions={WORD_TYPE_OPTIONS}
                  selectedWordTypes={wordTypes}
                  onWordTypesChange={(next) => setWordTypes(next as WordType[])}
                  onGenerate={generateVideoWordCloud}
                  generateDisabled={commentsTotal === 0}
                />
              </PageCard>
            </div>
          ) : null}
        </div>
        <div className="page-row">
          <PageCard>
            {activeTab === 'comments' ? (
              commentsLoading ? (
                <div className="video-detail-state">Loading comments...</div>
              ) : commentsError ? (
                <div className="video-detail-state">{commentsError}</div>
              ) : (
                <div className="video-comments">
                  {commentThreads.length === 0 ? (
                    <div className="video-detail-state">No comments found.</div>
                  ) : (
                    commentThreads.map((thread) => (
                      <CommentThreadItem
                        key={thread.parent.id}
                        thread={thread}
                        videoId={videoId}
                      />
                    ))
                  )}
                  <div className="pagination-footer">
                    <div className="pagination-main">
                      <PageSwitcher currentPage={commentsPage} totalPages={commentsTotalPages} onPageChange={setCommentsPage} />
                    </div>
                    <div className="pagination-size">
                      <PageSizePicker value={commentsPageSize} onChange={setCommentsPageSize} />
                    </div>
                  </div>
                </div>
              )
            ) : analyticsLoading ? (
              <div className="video-detail-state">Loading video analytics...</div>
            ) : analyticsError ? (
              <div className="video-detail-state">{analyticsError}</div>
            ) : (
              activeTab === 'analytics' ? (
                <MetricChartCard
                  granularity={granularity}
                  metrics={[
                    { key: 'views', label: 'Views', value: formatWholeNumber(totals.views) },
                    { key: 'watch_time', label: 'Watch time (hours)', value: formatWholeNumber(Math.round(totals.watch_time_minutes / 60)) },
                    { key: 'avg_duration', label: 'Avg view duration', value: formatDuration(Math.round(totals.average_view_duration_seconds)) },
                    { key: 'revenue', label: 'Estimated revenue', value: formatCurrency(totals.estimated_revenue) },
                  ]}
                  series={{
                    views: series.views ?? [],
                    watch_time: series.watch_time ?? [],
                    avg_duration: series.avg_duration ?? [],
                    revenue: series.revenue ?? [],
                  }}
                  previousSeries={{
                    views: previousSeries.views ?? [],
                    watch_time: previousSeries.watch_time ?? [],
                    avg_duration: previousSeries.avg_duration ?? [],
                    revenue: previousSeries.revenue ?? [],
                  }}
                  comparisonAggregation={{ avg_duration: 'avg' }}
                  publishedDates={{}}
                />
              ) : activeTab === 'monetization' ? (
                <MetricChartCard
                  granularity={granularity}
                  metrics={[
                    {
                      key: 'estimated_revenue',
                      label: 'Estimated revenue',
                      value: formatCurrency(monetizationTotals.estimated_revenue),
                    },
                    {
                      key: 'ad_impressions',
                      label: 'Ad impressions',
                      value: formatWholeNumber(monetizationTotals.ad_impressions),
                    },
                    {
                      key: 'monetized_playbacks',
                      label: 'Monetized playbacks',
                      value: formatWholeNumber(monetizationTotals.monetized_playbacks),
                    },
                    {
                      key: 'cpm',
                      label: 'CPM',
                      value: formatCurrency(monetizationTotals.cpm),
                    },
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
                />
              ) : (
                <MetricChartCard
                  granularity={granularity}
                  metrics={discoveryMetrics}
                  series={{}}
                  multiSeriesByMetric={discoverySeriesByMetric}
                  previousMultiSeriesByMetric={previousDiscoverySeriesByMetric}
                  publishedDates={{}}
                />
              )
            )}
          </PageCard>
        </div>
        {activeTab === 'discovery' && !analyticsLoading && !analyticsError ? (
          <div className="page-row">
            <div className="video-detail-discovery-row">
              <PageCard>
                <TrafficSourceShareCard items={discoveryShareItems} />
              </PageCard>
              <PageCard>
                <SearchInsightsTopTermsCard
                  items={searchTopTerms}
                  loading={searchTopTermsLoading}
                  error={searchTopTermsError}
                  startDate={range.start}
                  endDate={range.end}
                  videoIds={videoId ? [videoId] : []}
                />
              </PageCard>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default VideoDetail



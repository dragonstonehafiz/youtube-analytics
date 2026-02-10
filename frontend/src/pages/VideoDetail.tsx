import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useParams } from 'react-router-dom'
import { ActionButton, DateRangePicker, Dropdown, PageSizePicker, PageSwitcher } from '../components/ui'
import { MetricChartCard } from '../components/analytics'
import { PageCard } from '../components/layout'
import { CommentThreadItem, type CommentRow } from '../components/comments'
import { getStored, setStored } from '../utils/storage'
import './Page.css'

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
  estimated_revenue: number | null
  subscribers_gained: number | null
  subscribers_lost: number | null
}

type SeriesPoint = { date: string; value: number }
type Granularity = 'daily' | '7d' | '28d' | '90d' | 'monthly' | 'yearly'
type CommentSort = 'published_at' | 'likes' | 'reply_count'

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

function VideoDetail() {
  const { videoId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [video, setVideo] = useState<VideoMetadata | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsError, setCommentsError] = useState<string | null>(null)
  const [comments, setComments] = useState<CommentRow[]>([])
  const [commentsTotal, setCommentsTotal] = useState(0)
  const [commentsPage, setCommentsPage] = useState(1)
  const [commentsPageSize, setCommentsPageSize] = useState(10)
  const [commentsSort, setCommentsSort] = useState<CommentSort>(getStored('videoDetailCommentsSort', 'published_at'))
  const [dailyRows, setDailyRows] = useState<VideoDailyRow[]>([])
  const [years, setYears] = useState<string[]>([])
  const rangeOptions = [
    { label: 'Last 7 days', value: 'range:7d' },
    { label: 'Last 28 days', value: 'range:28d' },
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
  const [totals, setTotals] = useState({
    views: 0,
    watch_time_minutes: 0,
    subscribers_net: 0,
    estimated_revenue: 0,
  })
  const activeTab = useMemo(() => {
    const tab = searchParams.get('tab')
    return tab === 'comments' ? 'comments' : 'analytics'
  }, [searchParams])
  const commentsTotalPages = useMemo(() => Math.max(1, Math.ceil(commentsTotal / commentsPageSize)), [commentsTotal, commentsPageSize])
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
    setStored('videoDetailGranularity', granularity)
  }, [granularity])

  useEffect(() => {
    setStored('videoDetailCommentsSort', commentsSort)
  }, [commentsSort])

  useEffect(() => {
    async function loadVideoAnalytics() {
      if (!videoId) {
        setDailyRows([])
        setYears([])
        setSeries({ views: [], watch_time: [], subscribers: [], revenue: [] })
        setTotals({ views: 0, watch_time_minutes: 0, subscribers_net: 0, estimated_revenue: 0 })
        setAnalyticsError('Missing video ID.')
        return
      }
      setAnalyticsLoading(true)
      setAnalyticsError(null)
      try {
        const response = await fetch(`http://127.0.0.1:8000/analytics/daily?video_id=${videoId}&limit=10000`)
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
          setSeries({ views: [], watch_time: [], subscribers: [], revenue: [] })
          setTotals({ views: 0, watch_time_minutes: 0, subscribers_net: 0, estimated_revenue: 0 })
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
        if (sorted.length === 0) {
          setSeries({ views: [], watch_time: [], subscribers: [], revenue: [] })
          setTotals({ views: 0, watch_time_minutes: 0, subscribers_net: 0, estimated_revenue: 0 })
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
        const subsSeries = days.map((day) => ({
          date: day,
          value: (byDay.get(day)?.subscribers_gained ?? 0) - (byDay.get(day)?.subscribers_lost ?? 0),
        }))
        const revenueSeries = days.map((day) => ({ date: day, value: byDay.get(day)?.estimated_revenue ?? 0 }))

        const totalViews = sorted.reduce((sum, item) => sum + (item.views ?? 0), 0)
        const totalWatchMinutes = sorted.reduce((sum, item) => sum + (item.watch_time_minutes ?? 0), 0)
        const totalSubsNet = sorted.reduce(
          (sum, item) => sum + (item.subscribers_gained ?? 0) - (item.subscribers_lost ?? 0),
          0
        )
        const totalRevenue = sorted.reduce((sum, item) => sum + (item.estimated_revenue ?? 0), 0)

        setSeries({
          views: aggregatePoints(viewsSeries, granularity),
          watch_time: aggregatePoints(watchSeries, granularity),
          subscribers: aggregatePoints(subsSeries, granularity),
          revenue: aggregatePoints(revenueSeries, granularity),
        })
        setTotals({
          views: totalViews,
          watch_time_minutes: totalWatchMinutes,
          subscribers_net: totalSubsNet,
          estimated_revenue: totalRevenue,
        })
    } catch (err) {
      setAnalyticsError(err instanceof Error ? err.message : 'Failed to process analytics.')
    }
  }, [dailyRows, range.start, range.end, granularity])

  useEffect(() => {
    async function loadComments() {
      if (!videoId || activeTab !== 'comments') {
        return
      }
      setCommentsLoading(true)
      setCommentsError(null)
      try {
        const offset = (commentsPage - 1) * commentsPageSize
        const response = await fetch(
          `http://127.0.0.1:8000/comments?video_id=${videoId}&limit=${commentsPageSize}&offset=${offset}&sort_by=${commentsSort}`
        )
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
  }, [videoId, activeTab, commentsPage, commentsPageSize, commentsSort])

  useEffect(() => {
    setCommentsPage(1)
  }, [commentsSort])

  useEffect(() => {
    setCommentsPage(1)
  }, [commentsPageSize])

  return (
    <section className="page">
      <header className="page-header">
        <h1>Video</h1>
      </header>
      <div className="page-body">
        <div className="page-row">
          <PageCard title="Video Metadata">
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
                    <strong>{video.published_at ? new Date(video.published_at).toLocaleDateString() : '-'}</strong>
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
                label="Analytics"
                onClick={() => setSearchParams({ tab: 'analytics' })}
                variant="soft"
                active={activeTab === 'analytics'}
              />
              <ActionButton
                label="Comments"
                onClick={() => setSearchParams({ tab: 'comments' })}
                variant="soft"
                active={activeTab === 'comments'}
              />
            </div>
            {activeTab === 'analytics' ? (
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
            ) : activeTab === 'comments' ? (
              <div className="analytics-range-controls">
                <Dropdown
                  value={commentsSort}
                  onChange={(value) => setCommentsSort(value as CommentSort)}
                  placeholder="Sort by date"
                  items={[
                    { type: 'option' as const, label: 'Sort: Date posted', value: 'published_at' },
                    { type: 'option' as const, label: 'Sort: Likes', value: 'likes' },
                    { type: 'option' as const, label: 'Sort: Reply count', value: 'reply_count' },
                  ]}
                />
              </div>
            ) : null}
          </div>
        </div>
        <div className="page-row">
          <PageCard title={activeTab === 'comments' ? 'Comments' : 'Analytics'}>
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
              <MetricChartCard
                metrics={[
                  { key: 'views', label: 'Views', value: totals.views.toLocaleString() },
                  { key: 'watch_time', label: 'Watch time (hours)', value: Math.round(totals.watch_time_minutes / 60).toLocaleString() },
                  { key: 'subscribers', label: 'Subscribers', value: totals.subscribers_net.toLocaleString() },
                  { key: 'revenue', label: 'Estimated revenue', value: `$${Math.round(totals.estimated_revenue).toLocaleString()}` },
                ]}
                series={{
                  views: series.views ?? [],
                  watch_time: series.watch_time ?? [],
                  subscribers: series.subscribers ?? [],
                  revenue: series.revenue ?? [],
                }}
                publishedDates={{}}
              />
            )}
          </PageCard>
        </div>
      </div>
    </section>
  )
}

export default VideoDetail

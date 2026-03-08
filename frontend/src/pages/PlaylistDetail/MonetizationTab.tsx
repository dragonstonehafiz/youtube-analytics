import { useEffect, useMemo, useState } from 'react'
import { MetricChartCard, type MetricItem, type Granularity, type SeriesPoint } from '../../components/charts'
import { MonetizationContentPerformanceCard, MonetizationEarningsCard, PageCard, type VideoDetailListItem } from '../../components/cards'
import { PlaylistItemsTable, type PlaylistItemRowData, type PlaylistItemSortKey } from '../../components/tables'
import { PageSizePicker, PageSwitcher } from '../../components/ui'
import usePagination from '../../hooks/usePagination'
import { formatCurrency, formatWholeNumber } from '../../utils/number'
type PlaylistDailyRow = {
  day: string
  views: number | null
  watch_time_minutes?: number | null
  estimated_revenue?: number | null
  ad_impressions?: number | null
  monetized_playbacks?: number | null
  cpm?: number | null
}
type PublishedDates = Record<string, { video_id?: string; title: string; published_at: string; thumbnail_url: string; content_type: string }[]>
type MonetizationContentType = 'video' | 'short'
type MonetizationMonthly = { monthKey: string; label: string; amount: number }
type MonetizationTopItem = { video_id: string; title: string; thumbnail_url: string; revenue: number }
type MonetizationPerformance = { views: number; estimated_revenue: number; rpm: number; items: MonetizationTopItem[] }

type Props = {
  playlistId: string | undefined
  range: { start: string; end: string }
  previousRange: { start: string; end: string }
  granularity: Granularity
  onOpenVideo: (videoId: string) => void
}

export default function MonetizationTab({ playlistId, range, previousRange, granularity, onOpenVideo }: Props) {
  const [videoDailyRows, setVideoDailyRows] = useState<PlaylistDailyRow[]>([])
  const [previousVideoDailyRows, setPreviousVideoDailyRows] = useState<PlaylistDailyRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [publishedDates, setPublishedDates] = useState<PublishedDates>({})
  const [topPerformingItems, setTopPerformingItems] = useState<VideoDetailListItem[]>([])
  const [recentPerformingItems, setRecentPerformingItems] = useState<VideoDetailListItem[]>([])
  const [monetizationContentType, setMonetizationContentType] = useState<MonetizationContentType>('video')
  const [items, setItems] = useState<PlaylistItemRowData[]>([])
  const [itemsTotal, setItemsTotal] = useState(0)
  const [loadingItems, setLoadingItems] = useState(false)
  const [errorItems, setErrorItems] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<PlaylistItemSortKey>('position')
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc')
  const { page, setPage, pageSize, setPageSize, totalPages } = usePagination({ total: itemsTotal, defaultPageSize: 10 })

  useEffect(() => { setPage(1) }, [sortBy, direction, setPage])

  useEffect(() => {
    async function loadItems() {
      if (!playlistId) { setItems([]); setItemsTotal(0); return }
      setLoadingItems(true)
      setErrorItems(null)
      try {
        const offset = (page - 1) * pageSize
        const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset), sort_by: sortBy, direction })
        const res = await fetch(`http://localhost:8000/playlists/${playlistId}/items?${params.toString()}`)
        if (!res.ok) throw new Error(`Failed to load playlist items (${res.status})`)
        const data = await res.json()
        setItems(Array.isArray(data.items) ? (data.items as PlaylistItemRowData[]) : [])
        setItemsTotal(typeof data.total === 'number' ? data.total : 0)
      } catch (err) {
        setErrorItems(err instanceof Error ? err.message : 'Failed to load playlist items.')
      } finally {
        setLoadingItems(false)
      }
    }
    loadItems()
  }, [playlistId, page, pageSize, sortBy, direction])

  const toggleSort = (key: PlaylistItemSortKey) => {
    if (sortBy === key) { setDirection((prev) => (prev === 'asc' ? 'desc' : 'asc')); return }
    setSortBy(key)
    setDirection(key === 'position' ? 'asc' : 'desc')
  }

  useEffect(() => {
    async function loadVideoAnalytics() {
      if (!playlistId) { setVideoDailyRows([]); setPreviousVideoDailyRows([]); return }
      setLoading(true)
      setError(null)
      try {
        const [currentResponse, previousResponse] = await Promise.all([
          fetch(`http://localhost:8000/analytics/playlist-video-daily?playlist_id=${playlistId}&start_date=${range.start}&end_date=${range.end}`),
          fetch(`http://localhost:8000/analytics/playlist-video-daily?playlist_id=${playlistId}&start_date=${previousRange.start}&end_date=${previousRange.end}`),
        ])
        if (!currentResponse.ok || !previousResponse.ok) {
          const status = !currentResponse.ok ? currentResponse.status : previousResponse.status
          throw new Error(`Failed to load playlist analytics (${status})`)
        }
        const [currentData, previousData] = await Promise.all([currentResponse.json(), previousResponse.json()])
        const sortRows = (rows: PlaylistDailyRow[]) =>
          [...rows].filter((r) => typeof r.day === 'string').sort((a, b) => a.day.localeCompare(b.day))
        setVideoDailyRows(sortRows((Array.isArray(currentData.items) ? currentData.items : []) as PlaylistDailyRow[]))
        setPreviousVideoDailyRows(sortRows((Array.isArray(previousData.items) ? previousData.items : []) as PlaylistDailyRow[]))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load playlist analytics.')
      } finally {
        setLoading(false)
      }
    }
    loadVideoAnalytics()
  }, [playlistId, range.start, range.end, previousRange.start, previousRange.end])

  useEffect(() => {
    async function loadPublished() {
      if (!playlistId) { setPublishedDates({}); return }
      try {
        const response = await fetch(
          `http://localhost:8000/playlists/${playlistId}/published?start_date=${range.start}&end_date=${range.end}`
        )
        if (!response.ok) throw new Error(`Failed to load playlist published dates (${response.status})`)
        const data = await response.json()
        const rawItems = Array.isArray(data.items) ? data.items : []
        const map: PublishedDates = {}
        rawItems.forEach((item: { day?: string; items?: unknown[] }) => {
          if (item.day) map[item.day] = Array.isArray(item.items) ? item.items as PublishedDates[string] : []
        })
        setPublishedDates(map)
      } catch { /* ignore */ }
    }
    loadPublished()
  }, [playlistId, range.start, range.end])

  useEffect(() => {
    async function loadTopPerformingItems() {
      if (!playlistId) { setTopPerformingItems([]); return }
      try {
        const params = new URLSearchParams({ limit: '10', offset: '0', sort_by: 'views', direction: 'desc' })
        const response = await fetch(`http://localhost:8000/playlists/${playlistId}/items?${params.toString()}`)
        if (!response.ok) throw new Error(`Failed to load top playlist content (${response.status})`)
        const data = await response.json()
        const rows = Array.isArray(data.items) ? (data.items as PlaylistItemRowData[]) : []
        setTopPerformingItems(rows.filter((item) => Boolean(item.video_id)).map((item) => ({
          video_id: item.video_id as string,
          title: item.video_title || item.title || '(untitled)',
          thumbnail_url: item.video_thumbnail_url || item.thumbnail_url || '',
          published_at: item.video_published_at || item.published_at || '',
          views: item.video_view_count ?? 0,
          watch_time_minutes: item.video_watch_time_minutes ?? 0,
          avg_view_duration_seconds: item.video_average_view_duration_seconds ?? 0,
          avg_view_pct: 0,
        })))
      } catch { setTopPerformingItems([]) }
    }
    loadTopPerformingItems()
  }, [playlistId])

  useEffect(() => {
    async function loadRecentPerformingItems() {
      if (!playlistId) { setRecentPerformingItems([]); return }
      try {
        const params = new URLSearchParams({ limit: '10', offset: '0', sort_by: 'recent_views', direction: 'desc' })
        const response = await fetch(`http://localhost:8000/playlists/${playlistId}/items?${params.toString()}`)
        if (!response.ok) throw new Error(`Failed to load recent top playlist content (${response.status})`)
        const data = await response.json()
        const rows = Array.isArray(data.items) ? (data.items as PlaylistItemRowData[]) : []
        setRecentPerformingItems(rows.filter((item) => Boolean(item.video_id)).map((item) => ({
          video_id: item.video_id as string,
          title: item.video_title || item.title || '(untitled)',
          thumbnail_url: item.video_thumbnail_url || item.thumbnail_url || '',
          published_at: item.video_published_at || item.published_at || '',
          views: item.video_recent_views ?? 0,
          watch_time_minutes: item.video_watch_time_minutes ?? 0,
          avg_view_duration_seconds: item.video_average_view_duration_seconds ?? 0,
          avg_view_pct: 0,
        })))
      } catch { setRecentPerformingItems([]) }
    }
    loadRecentPerformingItems()
  }, [playlistId])

  const buildSeries = (rows: PlaylistDailyRow[], start: string, end: string): Record<string, SeriesPoint[]> => {
    const sorted = [...rows]
      .filter((r) => typeof r.day === 'string' && r.day >= start && r.day <= end)
      .sort((a, b) => a.day.localeCompare(b.day))
    if (sorted.length === 0) return { estimated_revenue: [], ad_impressions: [], monetized_playbacks: [], cpm: [] }
    const byDay = new Map<string, PlaylistDailyRow>()
    sorted.forEach((r) => byDay.set(r.day, r))
    const days: string[] = []
    const cursor = new Date(`${sorted[0].day}T00:00:00Z`)
    const endDate = new Date(`${sorted[sorted.length - 1].day}T00:00:00Z`)
    while (cursor <= endDate) { days.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1) }
    return {
      estimated_revenue: days.map((day) => ({ date: day, value: byDay.get(day)?.estimated_revenue ?? 0 })),
      ad_impressions: days.map((day) => ({ date: day, value: byDay.get(day)?.ad_impressions ?? 0 })),
      monetized_playbacks: days.map((day) => ({ date: day, value: byDay.get(day)?.monetized_playbacks ?? 0 })),
      cpm: days.map((day) => ({ date: day, value: byDay.get(day)?.cpm ?? 0 })),
    }
  }

  const monetizationSeries = useMemo(
    () => buildSeries(videoDailyRows, range.start, range.end),
    [videoDailyRows, range.start, range.end]
  )
  const previousMonetizationSeries = useMemo(
    () => buildSeries(previousVideoDailyRows, previousRange.start, previousRange.end),
    [previousVideoDailyRows, previousRange.start, previousRange.end]
  )

  const monetizationTotals = useMemo(() => {
    const rows = videoDailyRows.filter((r) => typeof r.day === 'string' && r.day >= range.start && r.day <= range.end)
    const adImpressions = rows.reduce((sum, r) => sum + Number(r.ad_impressions ?? 0), 0)
    const cpmWeighted = adImpressions > 0
      ? rows.reduce((sum, r) => sum + Number(r.cpm ?? 0) * Number(r.ad_impressions ?? 0), 0) / adImpressions
      : 0
    return {
      estimated_revenue: rows.reduce((sum, r) => sum + Number(r.estimated_revenue ?? 0), 0),
      ad_impressions: adImpressions,
      monetized_playbacks: rows.reduce((sum, r) => sum + Number(r.monetized_playbacks ?? 0), 0),
      cpm: cpmWeighted,
    }
  }, [videoDailyRows, range.start, range.end])

  const monetizationEarningsLastSixMonths = useMemo<MonetizationMonthly[]>(() => {
    const monthTotals = new Map<string, number>()
    videoDailyRows
      .filter((r) => typeof r.day === 'string' && r.day >= range.start && r.day <= range.end)
      .forEach((r) => {
        const monthKey = r.day.slice(0, 7)
        monthTotals.set(monthKey, (monthTotals.get(monthKey) ?? 0) + Number(r.estimated_revenue ?? 0))
      })
    return Array.from(monthTotals.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6)
      .map(([monthKey, amount]) => {
        const [year, month] = monthKey.split('-')
        const dateValue = new Date(Date.UTC(Number(year), Number(month) - 1, 1))
        return { monthKey, label: dateValue.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), amount }
      })
  }, [videoDailyRows, range.start, range.end])

  const monetizationSidePerformance = useMemo<Record<MonetizationContentType, MonetizationPerformance>>(() => {
    const buildPerformance = (perfItems: VideoDetailListItem[]): MonetizationPerformance => {
      const views = perfItems.reduce((sum, item) => sum + Number(item.views ?? 0), 0)
      const estimatedRevenue = Number(monetizationTotals.estimated_revenue ?? 0)
      const rpm = views > 0 ? (estimatedRevenue / views) * 1000 : 0
      const totalItemViews = perfItems.reduce((sum, item) => sum + Math.max(0, Number(item.views ?? 0)), 0)
      const mappedItems: MonetizationTopItem[] = perfItems.map((item) => {
        const itemViews = Math.max(0, Number(item.views ?? 0))
        const share = totalItemViews > 0 ? itemViews / totalItemViews : 0
        return { video_id: item.video_id, title: item.title, thumbnail_url: item.thumbnail_url, revenue: estimatedRevenue * share }
      })
      return { views, estimated_revenue: estimatedRevenue, rpm, items: mappedItems }
    }
    return { video: buildPerformance(topPerformingItems), short: buildPerformance(recentPerformingItems) }
  }, [topPerformingItems, recentPerformingItems, monetizationTotals.estimated_revenue])

  const metricsData = useMemo<MetricItem[]>(
    () => [
      {
        key: 'estimated_revenue',
        label: 'Estimated revenue',
        value: formatCurrency(monetizationTotals.estimated_revenue),
        series: [{ key: 'estimated_revenue', label: '', color: '#0ea5e9', points: monetizationSeries.estimated_revenue ?? [] }],
        previousSeries: [{ key: 'estimated_revenue', label: '', color: '#0ea5e9', points: previousMonetizationSeries.estimated_revenue ?? [] }],
      },
      {
        key: 'ad_impressions',
        label: 'Ad impressions',
        value: formatWholeNumber(monetizationTotals.ad_impressions),
        series: [{ key: 'ad_impressions', label: '', color: '#0ea5e9', points: monetizationSeries.ad_impressions ?? [] }],
        previousSeries: [{ key: 'ad_impressions', label: '', color: '#0ea5e9', points: previousMonetizationSeries.ad_impressions ?? [] }],
      },
      {
        key: 'monetized_playbacks',
        label: 'Monetized playbacks',
        value: formatWholeNumber(monetizationTotals.monetized_playbacks),
        series: [{ key: 'monetized_playbacks', label: '', color: '#0ea5e9', points: monetizationSeries.monetized_playbacks ?? [] }],
        previousSeries: [{ key: 'monetized_playbacks', label: '', color: '#0ea5e9', points: previousMonetizationSeries.monetized_playbacks ?? [] }],
      },
      {
        key: 'cpm',
        label: 'CPM',
        value: formatCurrency(monetizationTotals.cpm),
        series: [{ key: 'cpm', label: '', color: '#0ea5e9', points: monetizationSeries.cpm ?? [] }],
        previousSeries: [{ key: 'cpm', label: '', color: '#0ea5e9', points: previousMonetizationSeries.cpm ?? [] }],
        comparisonAggregation: 'avg',
      },
    ],
    [monetizationTotals, monetizationSeries, previousMonetizationSeries]
  )

  return (
    <>
      <div className="page-row">
        <PageCard>
          {loading ? (
            <div className="video-detail-state">Loading playlist analytics...</div>
          ) : error ? (
            <div className="video-detail-state">{error}</div>
          ) : (
            <MetricChartCard
              data={metricsData}
              granularity={granularity}
              publishedDates={publishedDates}
            />
          )}
        </PageCard>
      </div>
      <div className="page-row">
        <div className="playlist-detail-items-layout">
          <div className="playlist-detail-main-column">
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
          </div>
          <div className="playlist-detail-side-cards">
            <PageCard>
              <MonetizationEarningsCard items={monetizationEarningsLastSixMonths} />
            </PageCard>
            <PageCard>
              <MonetizationContentPerformanceCard
                contentType={monetizationContentType}
                onContentTypeChange={setMonetizationContentType}
                performance={monetizationSidePerformance}
                itemCount={7}
                onOpenVideo={onOpenVideo}
              />
            </PageCard>
          </div>
        </div>
      </div>
    </>
  )
}


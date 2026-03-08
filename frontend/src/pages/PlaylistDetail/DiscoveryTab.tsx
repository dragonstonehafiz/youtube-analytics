import { useEffect, useMemo, useState } from 'react'
import { MetricChartCard, type MetricItem, type Granularity } from '../../components/charts'
import {
  PageCard,
  SearchInsightsTopTermsCard,
  TrafficSourceShareCard,
  TrafficSourceTopVideosCard,
  type SearchInsightsTopTerm,
  type TopTrafficVideo,
  type TrafficSourceShareItem,
} from '../../components/cards'
import { PlaylistItemsTable, type PlaylistItemRowData, type PlaylistItemSortKey } from '../../components/tables'
import { PageSizePicker, PageSwitcher } from '../../components/ui'
import usePagination from '../../hooks/usePagination'
import { formatWholeNumber } from '../../utils/number'
import { buildTrafficSeries, type TrafficSourceRow } from '../../utils/trafficSeries'
type PublishedDates = Record<string, { video_id?: string; title: string; published_at: string; thumbnail_url: string; content_type: string }[]>
type TopVideosBySourceResponseItem = { video_id: string; title: string; thumbnail_url: string; published_at: string; views: number; watch_time_minutes: number }
type TopSearchResponseItem = { search_term: string; views: number; watch_time_minutes: number; video_count: number }

type Props = {
  playlistId: string | undefined
  range: { start: string; end: string }
  previousRange: { start: string; end: string }
  granularity: Granularity
  onOpenVideo: (videoId: string) => void
}

export default function DiscoveryTab({ playlistId, range, previousRange, granularity, onOpenVideo }: Props) {
  const [discoveryTrafficRows, setDiscoveryTrafficRows] = useState<TrafficSourceRow[]>([])
  const [discoveryPreviousTrafficRows, setDiscoveryPreviousTrafficRows] = useState<TrafficSourceRow[]>([])
  const [trafficTopSource, setTrafficTopSource] = useState('')
  const [trafficTopVideos, setTrafficTopVideos] = useState<TopTrafficVideo[]>([])
  const [trafficTopLoading, setTrafficTopLoading] = useState(false)
  const [trafficTopError, setTrafficTopError] = useState<string | null>(null)
  const [playlistVideoIds, setPlaylistVideoIds] = useState<string[]>([])
  const [searchTopTerms, setSearchTopTerms] = useState<SearchInsightsTopTerm[]>([])
  const [searchTopTermsLoading, setSearchTopTermsLoading] = useState(false)
  const [searchTopTermsError, setSearchTopTermsError] = useState<string | null>(null)
  const [publishedDates, setPublishedDates] = useState<PublishedDates>({})
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
    async function loadDiscoveryTraffic() {
      if (!playlistId) { setDiscoveryTrafficRows([]); setDiscoveryPreviousTrafficRows([]); return }
      try {
        const [currentResponse, previousResponse] = await Promise.all([
          fetch(`http://localhost:8000/analytics/playlist-traffic-sources?playlist_id=${playlistId}&start_date=${range.start}&end_date=${range.end}`),
          fetch(`http://localhost:8000/analytics/playlist-traffic-sources?playlist_id=${playlistId}&start_date=${previousRange.start}&end_date=${previousRange.end}`),
        ])
        if (!currentResponse.ok || !previousResponse.ok) throw new Error('Failed to load playlist discovery traffic data.')
        const [currentPayload, previousPayload] = await Promise.all([currentResponse.json(), previousResponse.json()])
        const toRows = (rawItems: Record<string, unknown>[]): TrafficSourceRow[] =>
          rawItems.map((item) => ({
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
    async function loadPlaylistVideoIds() {
      if (!playlistId) { setPlaylistVideoIds([]); return }
      try {
        const collected = new Set<string>()
        const pageLimit = 1000
        let offset = 0
        let total = 0
        do {
          const params = new URLSearchParams({ limit: String(pageLimit), offset: String(offset), sort_by: 'position', direction: 'asc' })
          const response = await fetch(`http://localhost:8000/playlists/${playlistId}/items?${params.toString()}`)
          if (!response.ok) throw new Error(`Failed to load playlist items for search scope (${response.status})`)
          const payload = await response.json()
          const batchItems = Array.isArray(payload?.items) ? payload.items : []
          total = Number(payload?.total ?? 0)
          batchItems.forEach((item: Record<string, unknown>) => {
            const videoId = String(item?.video_id ?? '').trim()
            if (videoId) collected.add(videoId)
          })
          offset += pageLimit
          if (batchItems.length < pageLimit) break
        } while (offset < total)
        setPlaylistVideoIds(Array.from(collected))
      } catch (loadError) {
        console.error('Failed to load playlist video IDs for search insights', loadError)
        setPlaylistVideoIds([])
      }
    }
    loadPlaylistVideoIds()
  }, [playlistId])

  const discoveryMetricsData = useMemo<MetricItem[]>(() => {
    const viewsSeries = buildTrafficSeries(discoveryTrafficRows, 'views', range.start, range.end)
    const watchTimeSeries = buildTrafficSeries(discoveryTrafficRows, 'watch_time', range.start, range.end)
    const previousViewsSeries = buildTrafficSeries(discoveryPreviousTrafficRows, 'views', previousRange.start, previousRange.end)
    const previousWatchTimeSeries = buildTrafficSeries(discoveryPreviousTrafficRows, 'watch_time', previousRange.start, previousRange.end)

    const totalViews = viewsSeries.reduce((sum, line) => sum + line.points.reduce((acc, point) => acc + point.value, 0), 0)
    const totalWatch = watchTimeSeries.reduce((sum, line) => sum + line.points.reduce((acc, point) => acc + point.value, 0), 0)

    return [
      {
        key: 'views',
        label: 'Views',
        value: formatWholeNumber(Math.round(totalViews)),
        series: viewsSeries,
        previousSeries: previousViewsSeries,
      },
      {
        key: 'watch_time',
        label: 'Watch time',
        value: formatWholeNumber(Math.round(totalWatch)),
        series: watchTimeSeries,
        previousSeries: previousWatchTimeSeries,
      },
    ]
  }, [discoveryTrafficRows, discoveryPreviousTrafficRows, range.start, range.end, previousRange.start, previousRange.end])

  const trafficShareItems = useMemo<TrafficSourceShareItem[]>(() => {
    const totals = new Map<string, number>()
    discoveryTrafficRows.forEach((row) => {
      if (!row.traffic_source) return
      totals.set(row.traffic_source, (totals.get(row.traffic_source) ?? 0) + (row.views ?? 0))
    })
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([source, views]) => ({ key: source, label: source.replace(/_/g, ' '), views }))
  }, [discoveryTrafficRows])

  const trafficSourceOptions = useMemo(
    () => trafficShareItems.map((item) => ({ label: item.label, value: item.key })),
    [trafficShareItems]
  )

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
      if (!playlistId || !trafficTopSource) { setTrafficTopVideos([]); setTrafficTopError(null); return }
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
        const response = await fetch(`http://localhost:8000/analytics/playlist-video-traffic-source-top-videos?${params.toString()}`)
        if (!response.ok) throw new Error(`Failed to load playlist traffic-source videos (${response.status})`)
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

  useEffect(() => {
    async function loadTopSearchTerms() {
      if (!playlistId || playlistVideoIds.length === 0) {
        setSearchTopTerms([])
        setSearchTopTermsError(null)
        setSearchTopTermsLoading(false)
        return
      }
      setSearchTopTermsLoading(true)
      setSearchTopTermsError(null)
      try {
        const params = new URLSearchParams({
          start_date: range.start,
          end_date: range.end,
          video_ids: playlistVideoIds.join(','),
        })
        const response = await fetch(`http://localhost:8000/analytics/video-search-insights?${params.toString()}`)
        if (!response.ok) throw new Error(`Failed to load top search terms (${response.status})`)
        const payload = await response.json()
        const termItems = (Array.isArray(payload?.items) ? payload.items : []) as TopSearchResponseItem[]
        setSearchTopTerms(termItems.map((item) => ({
          search_term: String(item.search_term ?? ''),
          views: Number(item.views ?? 0),
          watch_time_minutes: Number(item.watch_time_minutes ?? 0),
          video_count: Number(item.video_count ?? 0),
        })))
      } catch (loadError) {
        setSearchTopTerms([])
        setSearchTopTermsError(loadError instanceof Error ? loadError.message : 'Failed to load top search terms.')
      } finally {
        setSearchTopTermsLoading(false)
      }
    }
    loadTopSearchTerms()
  }, [playlistId, range.start, range.end, playlistVideoIds])


  return (
    <>
      <div className="page-row">
        <PageCard>
          <MetricChartCard
            data={discoveryMetricsData}
            granularity={granularity}
            publishedDates={publishedDates}
          />
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
                onOpenVideo={onOpenVideo}
              />
            </PageCard>
            <PageCard>
              <SearchInsightsTopTermsCard
                items={searchTopTerms}
                loading={searchTopTermsLoading}
                error={searchTopTermsError}
                startDate={range.start}
                endDate={range.end}
                videoIds={playlistVideoIds}
              />
            </PageCard>
          </div>
        </div>
      </div>
    </>
  )
}


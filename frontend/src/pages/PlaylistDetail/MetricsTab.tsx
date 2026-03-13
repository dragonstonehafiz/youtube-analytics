import { useEffect, useMemo, useState } from 'react'
import { MetricChartCard, type MetricItem, type Granularity } from '../../components/charts'
import { PageCard, VideoDetailListCard, type VideoDetailListItem } from '../../components/cards'
import { PlaylistItemsTable, type PlaylistItemRowData } from '../../components/tables'
import { PageSizePicker, PageSwitcher } from '../../components/ui'
import { formatCurrency, formatDuration, formatWholeNumber } from '../../utils/number'
import { fillDayGaps } from '../../utils/date'
import UploadPublishTooltip from '../../components/charts/UploadPublishTooltip'
import { useSpikes } from '../../hooks/useSpikes'
import { useSpikeHover } from '../../hooks/useSpikeHover'
import { usePlaylistAnalytics, type PlaylistDailyRow } from '../../hooks/usePlaylistAnalytics'
import { usePlaylistItems } from './usePlaylistItems'
import type { PublishedDates } from './types'

type Props = {
  playlistId: string | undefined
  range: { start: string; end: string }
  previousRange: { start: string; end: string }
  granularity: Granularity
  viewMode: 'playlist_views' | 'views'
  onOpenVideo: (videoId: string) => void
  videoIds: string[]
}

export default function MetricsTab({ playlistId, range, previousRange, granularity, viewMode, onOpenVideo, videoIds }: Props) {
  const { playlistRows, previousPlaylistRows, videoRows, previousVideoRows, loading, error } = usePlaylistAnalytics(playlistId, videoIds, range, previousRange)
  const [publishedDates, setPublishedDates] = useState<PublishedDates>({})
  const [topPerformingItems, setTopPerformingItems] = useState<VideoDetailListItem[]>([])
  const [topPerformingError, setTopPerformingError] = useState<string | null>(null)
  const [recentPerformingItems, setRecentPerformingItems] = useState<VideoDetailListItem[]>([])
  const [recentPerformingError, setRecentPerformingError] = useState<string | null>(null)
  const { items, loadingItems, errorItems, sortBy, direction, page, setPage, pageSize, setPageSize, totalPages, toggleSort } = usePlaylistItems(playlistId)
  const { hoverSpike, hoverHandlers } = useSpikeHover()
  const { setHoverSpike, spikeTimeoutRef, spikeHoverLockedRef } = hoverHandlers

  const viewsSpikes = useSpikes(range.start, range.end, 'views', granularity, hoverHandlers, videoIds)
  const watchTimeSpikes = useSpikes(range.start, range.end, 'watch_time_minutes', granularity, hoverHandlers, videoIds)
  const subscribersSpikes = useSpikes(range.start, range.end, 'subscribers_gained', granularity, hoverHandlers, videoIds)
  const revenueSpikes = useSpikes(range.start, range.end, 'estimated_revenue', granularity, hoverHandlers, videoIds)
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
      if (!playlistId) { setTopPerformingItems([]); setTopPerformingError('Missing playlist ID.'); return }
      setTopPerformingError(null)
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
          views: item.views ?? 0,
          watch_time_minutes: item.video_watch_time_minutes ?? 0,
          avg_view_duration_seconds: item.video_average_view_duration_seconds ?? 0,
          avg_view_pct: 0,
        })))
      } catch (err) {
        setTopPerformingError(err instanceof Error ? err.message : 'Failed to load top playlist content.')
        setTopPerformingItems([])
      }
    }
    loadTopPerformingItems()
  }, [playlistId])

  useEffect(() => {
    async function loadRecentPerformingItems() {
      if (!playlistId) { setRecentPerformingItems([]); setRecentPerformingError('Missing playlist ID.'); return }
      setRecentPerformingError(null)
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
      } catch (err) {
        setRecentPerformingError(err instanceof Error ? err.message : 'Failed to load recent top playlist content.')
        setRecentPerformingItems([])
      }
    }
    loadRecentPerformingItems()
  }, [playlistId])

  const dailyRows = useMemo<PlaylistDailyRow[]>(
    () => (viewMode === 'playlist_views' ? playlistRows : videoRows),
    [viewMode, playlistRows, videoRows]
  )
  const previousDailyRows = useMemo<PlaylistDailyRow[]>(
    () => (viewMode === 'playlist_views' ? previousPlaylistRows : previousVideoRows),
    [viewMode, previousPlaylistRows, previousVideoRows]
  )

  const totals = useMemo(() => {
    const sorted = [...dailyRows]
      .filter((r) => typeof r.day === 'string' && r.day >= range.start && r.day <= range.end)
      .sort((a, b) => a.day.localeCompare(b.day))
    if (sorted.length === 0) {
      return { views: 0, watch_time_minutes: 0, subscribers_net: 0, estimated_revenue: 0, average_view_duration_seconds: 0, average_time_in_playlist_seconds: 0 }
    }
    return {
      views: sorted.reduce((sum, r) => sum + (r.views ?? 0), 0),
      watch_time_minutes: sorted.reduce((sum, r) => sum + (r.watch_time_minutes ?? 0), 0),
      subscribers_net: sorted.reduce((sum, r) => sum + (r.subscribers_gained ?? 0) - (r.subscribers_lost ?? 0), 0),
      estimated_revenue: sorted.reduce((sum, r) => sum + (r.estimated_revenue ?? 0), 0),
      average_view_duration_seconds: viewMode === 'playlist_views' ? sorted.reduce((sum, r) => sum + (r.average_view_duration_seconds ?? 0), 0) / sorted.length : 0,
      average_time_in_playlist_seconds: sorted.reduce((sum, r) => sum + (r.average_time_in_playlist_seconds ?? 0), 0) / sorted.length,
    }
  }, [dailyRows, range.start, range.end, viewMode])

  const metricsData = useMemo<MetricItem[]>(() => {
    const sorted = [...dailyRows]
      .filter((r) => typeof r.day === 'string' && r.day >= range.start && r.day <= range.end)
      .sort((a, b) => a.day.localeCompare(b.day))

    const prevFiltered = previousDailyRows
      .filter((r) => typeof r.day === 'string' && r.day >= previousRange.start && r.day <= previousRange.end)
      .sort((a, b) => a.day.localeCompare(b.day))

    const byDay = new Map<string, PlaylistDailyRow>()
    sorted.forEach((r) => byDay.set(r.day, r))
    const previousByDay = new Map<string, PlaylistDailyRow>()
    prevFiltered.forEach((r) => previousByDay.set(r.day, r))

    const days = sorted.length > 0 ? fillDayGaps(sorted.map((r) => r.day)) : []
    const previousDays = prevFiltered.length > 0 ? fillDayGaps(prevFiltered.map((r) => r.day)) : []

    const isDuration = (key: string) => viewMode === 'playlist_views' && (key === 'subscribers' || key === 'revenue')

    return [
      {
        key: 'views',
        label: viewMode === 'playlist_views' ? 'Playlist Views' : 'Video Views',
        value: formatWholeNumber(totals.views),
        series: [{ key: 'views', label: '', color: '#0ea5e9', points: days.map((day) => ({ date: day, value: byDay.get(day)?.views ?? 0 })) }],
        previousSeries: [{ key: 'views', label: '', color: '#0ea5e9', points: previousDays.map((day) => ({ date: day, value: previousByDay.get(day)?.views ?? 0 })) }],
        spikeRegions: viewsSpikes,
      },
      {
        key: 'watch_time',
        label: 'Watch time (hours)',
        value: formatWholeNumber(Math.round(totals.watch_time_minutes / 60)),
        series: [{ key: 'watch_time', label: '', color: '#0ea5e9', points: days.map((day) => ({ date: day, value: Math.round((byDay.get(day)?.watch_time_minutes ?? 0) / 60) })) }],
        previousSeries: [{ key: 'watch_time', label: '', color: '#0ea5e9', points: previousDays.map((day) => ({ date: day, value: Math.round((previousByDay.get(day)?.watch_time_minutes ?? 0) / 60) })) }],
        spikeRegions: watchTimeSpikes,
      },
      {
        key: 'subscribers',
        label: 'Subscribers',
        value: formatWholeNumber(totals.subscribers_net),
        series: [{ key: 'subscribers', label: '', color: '#0ea5e9', points: days.map((day) => ({ date: day, value: (byDay.get(day)?.subscribers_gained ?? 0) - (byDay.get(day)?.subscribers_lost ?? 0) })) }],
        previousSeries: [{ key: 'subscribers', label: '', color: '#0ea5e9', points: previousDays.map((day) => ({ date: day, value: (previousByDay.get(day)?.subscribers_gained ?? 0) - (previousByDay.get(day)?.subscribers_lost ?? 0) })) }],
        spikeRegions: subscribersSpikes,
      },
      {
        key: 'revenue',
        label: viewMode === 'views' ? 'Estimated revenue' : 'Avg time in playlist',
        value: viewMode === 'views' ? formatCurrency(totals.estimated_revenue) : formatDuration(totals.average_time_in_playlist_seconds),
        series: [{ key: 'revenue', label: '', color: '#0ea5e9', points: days.map((day) => ({ date: day, value: viewMode === 'playlist_views' ? byDay.get(day)?.average_time_in_playlist_seconds ?? 0 : byDay.get(day)?.estimated_revenue ?? 0 })) }],
        previousSeries: [{ key: 'revenue', label: '', color: '#0ea5e9', points: previousDays.map((day) => ({ date: day, value: viewMode === 'playlist_views' ? previousByDay.get(day)?.average_time_in_playlist_seconds ?? 0 : previousByDay.get(day)?.estimated_revenue ?? 0 })) }],
        comparisonAggregation: viewMode === 'playlist_views' ? 'avg' : undefined,
        isDuration: isDuration('revenue'),
        spikeRegions: revenueSpikes,
      },
    ]
  }, [dailyRows, previousDailyRows, range.start, range.end, previousRange.start, previousRange.end, viewMode, totals, viewsSpikes, watchTimeSpikes, subscribersSpikes, revenueSpikes])

  return (
    <>
      <div className="page-row">
        <div className="playlist-chart-wrapper">
          <PageCard>
            {loading ? (
              <div className="video-detail-state">Loading playlist analytics...</div>
            ) : error ? (
              <div className="video-detail-state">{error}</div>
            ) : (
              <>
                <MetricChartCard
                  data={metricsData}
                  granularity={granularity}
                  publishedDates={publishedDates}
                />
                <UploadPublishTooltip
                  hover={hoverSpike}
                  titleOverride={hoverSpike ? `Spike: ${hoverSpike.startDate} → ${hoverSpike.endDate}` : undefined}
                  statsOverride={hoverSpike ? [`${hoverSpike.items.length} top ${hoverSpike.items.length === 1 ? 'video' : 'videos'} during spike`] : undefined}
                  onMouseEnter={() => {
                    if (spikeTimeoutRef.current) {
                      window.clearTimeout(spikeTimeoutRef.current)
                    }
                    spikeHoverLockedRef.current = true
                  }}
                  onMouseLeave={() => {
                    spikeHoverLockedRef.current = false
                    if (spikeTimeoutRef.current) {
                      window.clearTimeout(spikeTimeoutRef.current)
                    }
                    spikeTimeoutRef.current = window.setTimeout(() => {
                      if (!spikeHoverLockedRef.current) {
                        setHoverSpike(null)
                      }
                    }, 150)
                  }}
                />
              </>
            )}
          </PageCard>
        </div>
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
              {topPerformingError ? (
                <div className="video-detail-state">{topPerformingError}</div>
              ) : (
                <VideoDetailListCard
                  title="Top performing content"
                  items={topPerformingItems}
                  onOpenVideo={onOpenVideo}
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
                  onOpenVideo={onOpenVideo}
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
    </>
  )
}

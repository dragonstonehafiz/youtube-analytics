import { useEffect, useMemo, useState } from 'react'
import { MetricChartCard, type MetricItem, type Granularity } from '../../components/charts'
import { MonetizationContentPerformanceCard, MonetizationEarningsCard, PageCard, type VideoDetailListItem } from '../../components/cards'
import { PlaylistItemsTable, type PlaylistItemRowData } from '../../components/tables'
import { PageSizePicker, PageSwitcher } from '../../components/ui'
import { formatCurrency, formatWholeNumber } from '../../utils/number'
import UploadPublishTooltip from '../../components/charts/UploadPublishTooltip'
import { useSpikes } from '../../hooks/useSpikes'
import { useSpikeHover } from '../../hooks/useSpikeHover'
import { useVideoAnalyticsByIds } from '../../hooks/useVideoAnalytics'
import type { MonetizationContentType, MonetizationTopItem, MonetizationPerformance, MonetizationMonthly } from '../../utils/monetization'
import { usePlaylistItems } from './usePlaylistItems'
import type { PublishedDates } from './types'

type Props = {
  playlistId: string | undefined
  range: { start: string; end: string }
  previousRange: { start: string; end: string }
  granularity: Granularity
  onOpenVideo: (videoId: string) => void
  videoIds: string[]
}

export default function MonetizationTab({ playlistId, range, previousRange, granularity, onOpenVideo, videoIds }: Props) {
  const { rows: videoDailyRows, previousRows: previousVideoDailyRows, loading, error } = useVideoAnalyticsByIds(videoIds, range, previousRange)
  const [publishedDates, setPublishedDates] = useState<PublishedDates>({})
  const [topPerformingItems, setTopPerformingItems] = useState<VideoDetailListItem[]>([])
  const [recentPerformingItems, setRecentPerformingItems] = useState<VideoDetailListItem[]>([])
  const [monetizationContentType, setMonetizationContentType] = useState<MonetizationContentType>('video')
  const { items, loadingItems, errorItems, sortBy, direction, page, setPage, pageSize, setPageSize, totalPages, toggleSort } = usePlaylistItems(playlistId)
  const { hoverSpike, hoverHandlers } = useSpikeHover()
  const { setHoverSpike, spikeTimeoutRef, spikeHoverLockedRef } = hoverHandlers

  const revenueSpikes = useSpikes(range.start, range.end, 'estimated_revenue', granularity, hoverHandlers, videoIds)
  const adImpressionsSpikes = useSpikes(range.start, range.end, 'ad_impressions', granularity, hoverHandlers, videoIds)
  const monetizedPlaybacksSpikes = useSpikes(range.start, range.end, 'monetized_playbacks', granularity, hoverHandlers, videoIds)

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
          views: item.views ?? 0,
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

  const metricsData = useMemo<MetricItem[]>(() => [
    {
      key: 'estimated_revenue',
      label: 'Estimated revenue',
      value: formatCurrency(monetizationTotals.estimated_revenue),
      series: [{
        key: 'estimated_revenue',
        label: '',
        color: '#0ea5e9',
        points: videoDailyRows.map((item) => ({ date: item.day, value: item.estimated_revenue ?? 0 })),
      }],
      previousSeries: [{
        key: 'estimated_revenue',
        label: '',
        color: '#0ea5e9',
        points: previousVideoDailyRows.map((item) => ({ date: item.day, value: item.estimated_revenue ?? 0 })),
      }],
      spikeRegions: revenueSpikes,
    },
    {
      key: 'ad_impressions',
      label: 'Ad impressions',
      value: formatWholeNumber(monetizationTotals.ad_impressions),
      series: [{
        key: 'ad_impressions',
        label: '',
        color: '#0ea5e9',
        points: videoDailyRows.map((item) => ({ date: item.day, value: item.ad_impressions ?? 0 })),
      }],
      previousSeries: [{
        key: 'ad_impressions',
        label: '',
        color: '#0ea5e9',
        points: previousVideoDailyRows.map((item) => ({ date: item.day, value: item.ad_impressions ?? 0 })),
      }],
      spikeRegions: adImpressionsSpikes,
    },
    {
      key: 'monetized_playbacks',
      label: 'Monetized playbacks',
      value: formatWholeNumber(monetizationTotals.monetized_playbacks),
      series: [{
        key: 'monetized_playbacks',
        label: '',
        color: '#0ea5e9',
        points: videoDailyRows.map((item) => ({ date: item.day, value: item.monetized_playbacks ?? 0 })),
      }],
      previousSeries: [{
        key: 'monetized_playbacks',
        label: '',
        color: '#0ea5e9',
        points: previousVideoDailyRows.map((item) => ({ date: item.day, value: item.monetized_playbacks ?? 0 })),
      }],
      spikeRegions: monetizedPlaybacksSpikes,
    },
    {
      key: 'cpm',
      label: 'CPM',
      value: formatCurrency(monetizationTotals.cpm),
      series: [{
        key: 'cpm',
        label: '',
        color: '#0ea5e9',
        points: videoDailyRows.map((item) => ({ date: item.day, value: item.cpm ?? 0 })),
      }],
      previousSeries: [{
        key: 'cpm',
        label: '',
        color: '#0ea5e9',
        points: previousVideoDailyRows.map((item) => ({ date: item.day, value: item.cpm ?? 0 })),
      }],
      comparisonAggregation: 'avg',
    },
  ], [videoDailyRows, previousVideoDailyRows, monetizationTotals, revenueSpikes, adImpressionsSpikes, monetizedPlaybacksSpikes])

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


import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ActionButton, StatCard, Textbox, VideoThumbnail, DisplayVideoTitle, DisplayDate } from '../../components/ui'
import { DataRangeControl, type DateRangeValue } from '../../components/features'
import { fetchChannelYears } from '../../utils/years'
import { PageCard, type VideoDetailListItem } from '../../components/cards'
import type { TopContentItem } from '../../components/tables'
import type { PublishedItem } from '../../components/charts'
import CommentsTab from './CommentsTab'
import { MetricsTab, EngagementTab, MonetizationTab, DiscoveryTab, InsightsTab } from '../../tabs'
import { formatWholeNumber, formatDuration } from '../../utils/number'
import { getStored, setStored } from '../../utils/storage'
import { usePlaylistVideoIds } from '../../hooks/usePlaylistVideoIds'
import { usePlaylistAnalytics } from '../../hooks/usePlaylistAnalytics'
import type { PlaylistMeta, PlaylistAnalyticsTab, PlaylistViewMode, TabDataSource, DiscoveryDataSource } from '../../types'
import type { TrafficSourceRow } from '../../utils/trafficSeries'
import { PLAYLIST_DETAIL_TABS, parsePlaylistDetailTab, VIEW_MODE_OPTIONS } from './utils'
import ContentTab from './ContentTab'
import '../shared.css'
import './PlaylistDetail.css'

const EMPTY_RANGE = { start: '', end: '' }

function PlaylistDetail() {
  const { playlistId } = useParams()
  const navigate = useNavigate()
  const [meta, setMeta] = useState<PlaylistMeta | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [errorMeta, setErrorMeta] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<PlaylistViewMode>(getStored('playlistDetailViewMode', 'playlist_views'))
  const initialTab = getStored('playlistDetailTab', 'metrics') as string
  const [analyticsTab, setAnalyticsTab] = useState<PlaylistAnalyticsTab>(parsePlaylistDetailTab(initialTab))
  const [rangeValue, setRangeValue] = useState<DateRangeValue | null>(null)
  const [years, setYears] = useState<string[]>([])
  const [topContent, setTopContent] = useState<TopContentItem[]>([])
  const [latestLongform, setLatestLongform] = useState<VideoDetailListItem[]>([])
  const [latestShorts, setLatestShorts] = useState<VideoDetailListItem[]>([])
  const [playlistPublishedDates, setPlaylistPublishedDates] = useState<Record<string, PublishedItem[]>>({})
  const [playlistTrafficRows, setPlaylistTrafficRows] = useState<TrafficSourceRow[]>([])
  const [previousPlaylistTrafficRows, setPreviousPlaylistTrafficRows] = useState<TrafficSourceRow[]>([])
  const [videoTrafficRows, setVideoTrafficRows] = useState<TrafficSourceRow[]>([])
  const [previousVideoTrafficRows, setPreviousVideoTrafficRows] = useState<TrafficSourceRow[]>([])
  const videoIds = usePlaylistVideoIds(playlistId)

  const range = rangeValue?.range ?? EMPTY_RANGE
  const previousRange = rangeValue?.previousRange ?? EMPTY_RANGE

  const { playlistRows, previousPlaylistRows, videoRows, previousVideoRows, playlistTotals, videoTotals } = usePlaylistAnalytics(
    playlistId, videoIds, range, previousRange, { skip: !rangeValue },
  )

  const selectedSourceIndex = viewMode === 'playlist_views' ? 0 : 1

  const discoveryDataSources = useMemo<DiscoveryDataSource[]>(() => [
    {
      label: 'Playlist Views',
      trafficRows: playlistTrafficRows,
      previousTrafficRows: previousPlaylistTrafficRows,
      videoIds,
      publishedDates: playlistPublishedDates,
      playlistId,
    },
    {
      label: 'Video Views',
      trafficRows: videoTrafficRows,
      previousTrafficRows: previousVideoTrafficRows,
      videoIds,
      publishedDates: playlistPublishedDates,
      playlistId,
    },
  ], [playlistTrafficRows, previousPlaylistTrafficRows, videoTrafficRows, previousVideoTrafficRows, videoIds, playlistPublishedDates, playlistId])

  const tabDataSources = useMemo<TabDataSource[]>(() => [
    {
      label: 'Playlist Views',
      dailyRows: playlistRows,
      previousDailyRows: previousPlaylistRows,
      videoIds: [],
      totals: playlistTotals as Record<string, number | null>,
      publishedDates: playlistPublishedDates,
      playlistId,
      dataSourceLevel: 'playlist',
    },
    {
      label: 'Video Views',
      dailyRows: videoRows,
      previousDailyRows: previousVideoRows,
      videoIds,
      totals: videoTotals as Record<string, number | null>,
      publishedDates: playlistPublishedDates,
      playlistId,
      dataSourceLevel: 'video',
    },
  ], [playlistRows, previousPlaylistRows, videoRows, previousVideoRows, videoIds, playlistTotals, videoTotals, playlistPublishedDates, playlistId])

  useEffect(() => {
    fetchChannelYears().then(setYears).catch(() => {})
  }, [])

  useEffect(() => {
    if (!rangeValue || !playlistId) { setPlaylistPublishedDates({}); return }
    async function loadPublished() {
      try {
        const response = await fetch(`http://localhost:8000/playlists/${playlistId}/published?start_date=${range.start}&end_date=${range.end}`)
        if (!response.ok) throw new Error()
        const data = await response.json()
        const map: Record<string, PublishedItem[]> = {}
        const rawItems = Array.isArray(data.items) ? data.items : []
        rawItems.forEach((item: { day?: string; items?: unknown[] }) => {
          if (item.day) map[item.day] = Array.isArray(item.items) ? item.items as PublishedItem[] : []
        })
        setPlaylistPublishedDates(map)
      } catch { /* ignore */ }
    }
    loadPublished()
  }, [playlistId, range.start, range.end, rangeValue])

  useEffect(() => {
    if (!rangeValue || !playlistId) {
      setPlaylistTrafficRows([]); setPreviousPlaylistTrafficRows([])
      setVideoTrafficRows([]); setPreviousVideoTrafficRows([])
      return
    }
    const toRows = (items: Array<{ day?: string; traffic_source?: string; views?: number; watch_time_minutes?: number }>): TrafficSourceRow[] =>
      items.map((item) => ({ day: String(item?.day ?? ''), traffic_source: String(item?.traffic_source ?? ''), views: Number(item?.views ?? 0), watch_time_minutes: Number(item?.watch_time_minutes ?? 0) }))
    async function loadTraffic() {
      try {
        const plBase = `http://localhost:8000/analytics/playlist-traffic-sources?playlist_id=${playlistId}`
        const idsParam = videoIds.length > 0 ? `&video_ids=${encodeURIComponent(videoIds.join(','))}` : ''
        const vidBase = `http://localhost:8000/analytics/video-traffic-sources?${idsParam}`
        const [plCur, plPrev, vidCur, vidPrev] = await Promise.all([
          fetch(`${plBase}&start_date=${range.start}&end_date=${range.end}`),
          fetch(`${plBase}&start_date=${previousRange.start}&end_date=${previousRange.end}`),
          ...(videoIds.length > 0 ? [
            fetch(`${vidBase}&start_date=${range.start}&end_date=${range.end}`),
            fetch(`${vidBase}&start_date=${previousRange.start}&end_date=${previousRange.end}`),
          ] : [Promise.resolve(null), Promise.resolve(null)]),
        ])
        const [plCurData, plPrevData] = await Promise.all([plCur.json(), plPrev.json()])
        setPlaylistTrafficRows(Array.isArray(plCurData?.items) ? toRows(plCurData.items) : [])
        setPreviousPlaylistTrafficRows(Array.isArray(plPrevData?.items) ? toRows(plPrevData.items) : [])
        if (vidCur && vidPrev) {
          const [vidCurData, vidPrevData] = await Promise.all([vidCur.json(), vidPrev.json()])
          setVideoTrafficRows(Array.isArray(vidCurData?.items) ? toRows(vidCurData.items) : [])
          setPreviousVideoTrafficRows(Array.isArray(vidPrevData?.items) ? toRows(vidPrevData.items) : [])
        } else {
          setVideoTrafficRows([])
          setPreviousVideoTrafficRows([])
        }
      } catch {
        setPlaylistTrafficRows([]); setPreviousPlaylistTrafficRows([])
        setVideoTrafficRows([]); setPreviousVideoTrafficRows([])
      }
    }
    loadTraffic()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId, rangeValue, range.start, range.end, previousRange.start, previousRange.end, videoIds.join(',')])

  useEffect(() => {
    if (!rangeValue || videoIds.length === 0) return
    const { start, end } = rangeValue.range
    const idsParam = `&video_ids=${videoIds.join(',')}`
    async function loadTopContent() {
      try {
        const response = await fetch(`http://localhost:8000/analytics/top-content?start_date=${start}&end_date=${end}&limit=10${idsParam}`)
        const data = await response.json()
        const items = Array.isArray(data.items) ? data.items : []
        const transformed = items.map((item: Record<string, unknown>, index: number) => ({
          video_id: item.video_id || '',
          rank: index + 1,
          title: item.title || '(untitled)',
          published_at: item.published_at || '',
          upload_date: formatDisplayDate(item.published_at as string),
          thumbnail_url: item.thumbnail_url || '',
          avg_view_duration: formatDuration(item.avg_view_duration_seconds as number),
          avg_view_pct: formatWholeNumber(item.avg_view_pct as number ?? 0),
          views: formatWholeNumber(item.views as number ?? 0),
        }))
        setTopContent(transformed)
      } catch {
        setTopContent([])
      }
    }
    loadTopContent()
  }, [rangeValue, videoIds])

  useEffect(() => {
    if (!playlistId || videoIds.length === 0) {
      setLatestLongform([])
      setLatestShorts([])
      return
    }
    const today = new Date()
    const end = today.toISOString().slice(0, 10)
    const start = new Date(today)
    start.setDate(start.getDate() - 89)
    const startDate = start.toISOString().slice(0, 10)
    const mapItems = (payload: { items?: Record<string, unknown>[] }): VideoDetailListItem[] =>
      (Array.isArray(payload?.items) ? payload.items : []).map((item) => ({
        video_id: String(item.video_id ?? ''),
        title: String(item.title ?? '(untitled)'),
        thumbnail_url: String(item.thumbnail_url ?? ''),
        published_at: String(item.published_at ?? ''),
        views: Number(item.views ?? 0),
        watch_time_minutes: Number(item.watch_time_minutes ?? 0),
        avg_view_duration_seconds: Number(item.avg_view_duration_seconds ?? 0),
        avg_view_pct: 0,
      }))
    async function loadLatestContent() {
      try {
        const idsParam = `&video_ids=${encodeURIComponent(videoIds.join(','))}`
        const [longformRes, shortRes] = await Promise.all([
          fetch(`http://localhost:8000/analytics/top-content?start_date=${startDate}&end_date=${end}&limit=10&content_type=video&sort_by=views&direction=desc${idsParam}`),
          fetch(`http://localhost:8000/analytics/top-content?start_date=${startDate}&end_date=${end}&limit=10&content_type=short&sort_by=views&direction=desc${idsParam}`),
        ])
        const [longformData, shortData] = await Promise.all([longformRes.json(), shortRes.json()])
        setLatestLongform(mapItems(longformData))
        setLatestShorts(mapItems(shortData))
      } catch {
        setLatestLongform([])
        setLatestShorts([])
      }
    }
    loadLatestContent()
  }, [playlistId, videoIds])

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
        const response = await fetch(`http://localhost:8000/playlists/${playlistId}`)
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
    setStored('playlistDetailViewMode', viewMode)
  }, [viewMode])

  useEffect(() => {
    setStored('playlistDetailTab', analyticsTab)
  }, [analyticsTab])

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
                  <VideoThumbnail url={meta.thumbnail_url} title={meta.title} className="video-detail-thumb" />
                  <div className="video-detail-meta-content">
                    <div className="video-detail-title"><DisplayVideoTitle title={meta.title} /></div>
                    <Textbox value={meta.description || ''} placeholder="This playlist does not have a description" />
                  </div>
                </div>
                <div className="video-detail-grid">
                  <StatCard label="Visibility" value={meta.privacy_status || '-'} size="smaller" />
                  <StatCard label="Published" value={<DisplayDate date={meta.published_at} />} size="smaller" />
                  <StatCard label="Total Items" value={(meta.item_count ?? 0).toLocaleString()} size="smaller" />
                </div>
                <div className="video-detail-grid">
                  <StatCard label="Playlist ID" value={meta.id} size="smaller" />
                </div>
              </div>
            ) : (
              <div className="video-detail-state">Playlist metadata</div>
            )}
          </PageCard>
        </div>
        <div className="page-row">
          <div className="analytics-range-controls">
            {analyticsTab !== 'content' && analyticsTab !== 'comments' && (
              <DataRangeControl
                storageKey="playlistDetailRange"
                years={years}
                presetPlaceholder="Full data"
                secondaryControl={{
                  value: viewMode,
                  onChange: (value) => setViewMode(value as PlaylistViewMode),
                  placeholder: 'Playlist Views',
                  items: VIEW_MODE_OPTIONS,
                }}
                onChange={setRangeValue}
              />
            )}
          </div>
        </div>
        <div className="analytics-tab-row">
            {PLAYLIST_DETAIL_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={analyticsTab === tab.key ? 'analytics-tab active' : 'analytics-tab'}
                onClick={() => setAnalyticsTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
        </div>
        {analyticsTab === 'content' && (
          <ContentTab playlistId={playlistId} />
        )}
        {analyticsTab === 'comments' && (
          <CommentsTab playlistId={playlistId} />
        )}
        {rangeValue && analyticsTab === 'insights' && (
          <InsightsTab
            range={rangeValue.range}
            filterParam={{ playlist_id: playlistId ?? '' }}
            playlistId={playlistId}
          />
        )}
        {rangeValue && analyticsTab === 'metrics' && (
          <MetricsTab
            range={rangeValue.range}
            previousRange={rangeValue.previousRange}
            granularity={rangeValue.granularity}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
            dataSources={tabDataSources}
            selectedSourceIndex={selectedSourceIndex}
            topContent={topContent}
            latestLongform={latestLongform}
            latestShorts={latestShorts}
          />
        )}
        {rangeValue && analyticsTab === 'engagement' && (
          <EngagementTab
            range={rangeValue.range}
            previousRange={rangeValue.previousRange}
            granularity={rangeValue.granularity}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
            dataSources={tabDataSources}
            selectedSourceIndex={selectedSourceIndex}
          />
        )}
        {rangeValue && analyticsTab === 'monetization' && (
          <MonetizationTab
            range={rangeValue.range}
            previousRange={rangeValue.previousRange}
            granularity={rangeValue.granularity}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
            dataSources={tabDataSources}
            selectedSourceIndex={selectedSourceIndex}
          />
        )}
        {rangeValue && analyticsTab === 'discovery' && (
          <DiscoveryTab
            range={rangeValue.range}
            previousRange={rangeValue.previousRange}
            granularity={rangeValue.granularity}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
            dataSources={discoveryDataSources}
            selectedSourceIndex={selectedSourceIndex}
          />
        )}
      </div>
    </section>
  )
}

export default PlaylistDetail

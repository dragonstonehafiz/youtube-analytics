import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ActionButton, StatCard, Textbox } from '../../components/ui'
import { DataRangeControl, type DateRangeValue } from '../../components/features'
import { fetchChannelYears } from '../../utils/years'
import { PageCard } from '../../components/cards'
import MetricsTab from './MetricsTab'
import MonetizationTab from './MonetizationTab'
import DiscoveryTab from './DiscoveryTab'
import EngagementTab from './EngagementTab'
import CommentsTab from './CommentsTab'
import InsightsTab from './InsightsTab'
import { formatDisplayDate } from '../../utils/date'
import { getStored, setStored } from '../../utils/storage'
import { usePlaylistVideoIds } from '../../hooks/usePlaylistVideoIds'
import '../shared.css'
import './PlaylistDetail.css'

type PlaylistMeta = {
  id: string
  title: string | null
  description: string | null
  published_at: string | null
  privacy_status: string | null
  item_count: number | null
  thumbnail_url: string | null
}

export type PlaylistItemSummary = { video_id: string }

type PlaylistViewMode = 'playlist_views' | 'views'
type PlaylistAnalyticsTab = 'metrics' | 'engagement' | 'monetization' | 'discovery' | 'comments' | 'insights'

const VIEW_MODE_OPTIONS = [
  { label: 'Playlist Views', value: 'playlist_views' },
  { label: 'Video Views', value: 'views' },
]

function PlaylistDetail() {
  const { playlistId } = useParams()
  const navigate = useNavigate()
  const [meta, setMeta] = useState<PlaylistMeta | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [errorMeta, setErrorMeta] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<PlaylistViewMode>(getStored('playlistDetailViewMode', 'playlist_views'))
  const initialTab = getStored('playlistDetailTab', 'metrics') as string
  const [analyticsTab, setAnalyticsTab] = useState<PlaylistAnalyticsTab>(
    (['metrics', 'engagement', 'monetization', 'discovery', 'comments', 'insights'] as string[]).includes(initialTab)
      ? initialTab as PlaylistAnalyticsTab
      : 'metrics'
  )
  const [rangeValue, setRangeValue] = useState<DateRangeValue | null>(null)
  const [years, setYears] = useState<string[]>([])
  const videoIds = usePlaylistVideoIds(playlistId)

  useEffect(() => {
    fetchChannelYears().then(setYears).catch(() => {})
  }, [])

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
                  {meta.thumbnail_url ? (
                    <img className="video-detail-thumb" src={meta.thumbnail_url} alt={meta.title ?? 'Playlist'} />
                  ) : (
                    <div className="video-detail-thumb" />
                  )}
                  <div className="video-detail-meta-content">
                    <div className="video-detail-title">{meta.title || '(untitled)'}</div>
                    <Textbox value={meta.description || ''} placeholder="This playlist does not have a description" />
                  </div>
                </div>
                <div className="video-detail-grid">
                  <StatCard label="Visibility" value={meta.privacy_status || '-'} size="smaller" />
                  <StatCard label="Published" value={formatDisplayDate(meta.published_at)} size="smaller" />
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
            {analyticsTab !== 'comments' && (
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
          <button
            type="button"
            className={analyticsTab === 'metrics' ? 'analytics-tab active' : 'analytics-tab'}
            onClick={() => setAnalyticsTab('metrics')}
          >
            Metrics
          </button>
          <button
            type="button"
            className={analyticsTab === 'engagement' ? 'analytics-tab active' : 'analytics-tab'}
            onClick={() => setAnalyticsTab('engagement')}
          >
            Engagement
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
          <button
            type="button"
            className={analyticsTab === 'comments' ? 'analytics-tab active' : 'analytics-tab'}
            onClick={() => setAnalyticsTab('comments')}
          >
            Comments
          </button>
          <button
            type="button"
            className={analyticsTab === 'insights' ? 'analytics-tab active' : 'analytics-tab'}
            onClick={() => setAnalyticsTab('insights')}
          >
            Insights
          </button>
        </div>
        {analyticsTab === 'comments' && (
          <CommentsTab playlistId={playlistId} />
        )}
        {rangeValue && analyticsTab === 'insights' && (
          <InsightsTab
            playlistId={playlistId}
            range={rangeValue.range}
          />
        )}
        {rangeValue && analyticsTab === 'metrics' && (
          <MetricsTab
            playlistId={playlistId}
            range={rangeValue.range}
            previousRange={rangeValue.previousRange}
            granularity={rangeValue.granularity}
            viewMode={viewMode}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
            videoIds={videoIds}
          />
        )}
        {rangeValue && analyticsTab === 'engagement' && (
          <EngagementTab
            playlistId={playlistId}
            range={rangeValue.range}
            previousRange={rangeValue.previousRange}
            granularity={rangeValue.granularity}
            videoIds={videoIds}
          />
        )}
        {rangeValue && analyticsTab === 'monetization' && (
          <MonetizationTab
            playlistId={playlistId}
            range={rangeValue.range}
            previousRange={rangeValue.previousRange}
            granularity={rangeValue.granularity}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
            videoIds={videoIds}
          />
        )}
        {rangeValue && analyticsTab === 'discovery' && (
          <DiscoveryTab
            playlistId={playlistId}
            range={rangeValue.range}
            previousRange={rangeValue.previousRange}
            granularity={rangeValue.granularity}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
            videoIds={videoIds}
          />
        )}
      </div>
    </section>
  )
}

export default PlaylistDetail

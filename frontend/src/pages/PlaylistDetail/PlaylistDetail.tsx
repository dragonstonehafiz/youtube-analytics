import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ActionButton } from '../../components/ui'
import { DataRangeControl } from '../../components/features'
import { PageCard } from '../../components/cards'
import MetricsTab from './MetricsTab'
import MonetizationTab from './MonetizationTab'
import DiscoveryTab from './DiscoveryTab'
import CommentsTab from './CommentsTab'
import InsightsTab from './InsightsTab'
import { formatDisplayDate } from '../../utils/date'
import { getStored, setStored } from '../../utils/storage'
import { useAnalyticsDateRange, GRANULARITY_OPTIONS } from '../../hooks/useAnalyticsDateRange'
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

type Granularity = 'daily' | '7d' | '28d' | '90d' | 'monthly' | 'yearly'
type PlaylistViewMode = 'playlist_views' | 'video_views'
type PlaylistAnalyticsTab = 'metrics' | 'monetization' | 'discovery' | 'comments' | 'insights'

const VIEW_MODE_OPTIONS = [
  { label: 'Playlist Views', value: 'playlist_views' },
  { label: 'Video Views', value: 'video_views' },
]

function PlaylistDetail() {
  const { playlistId } = useParams()
  const navigate = useNavigate()
  const [meta, setMeta] = useState<PlaylistMeta | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [errorMeta, setErrorMeta] = useState<string | null>(null)
  const {
    years,
    mode, setMode,
    presetSelection, setPresetSelection,
    yearSelection, setYearSelection,
    monthSelection, setMonthSelection,
    customStart, setCustomStart,
    customEnd, setCustomEnd,
    range,
    previousRange,
    rangeOptions,
  } = useAnalyticsDateRange({ storageKey: 'playlistDetailRange' })
  const [viewMode, setViewMode] = useState<PlaylistViewMode>(getStored('playlistDetailViewMode', 'playlist_views'))
  const [granularity, setGranularity] = useState<Granularity>(getStored('playlistDetailGranularity', 'daily'))
  const [analyticsTab, setAnalyticsTab] = useState<PlaylistAnalyticsTab>(getStored('playlistDetailTab', 'metrics'))
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
    setStored('playlistDetailGranularity', granularity)
  }, [granularity])

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
            <div className="analytics-range-controls">
              {analyticsTab !== 'comments' && (
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
                  secondaryControl={{
                    value: viewMode,
                    onChange: (value) => setViewMode(value as PlaylistViewMode),
                    placeholder: 'Playlist Views',
                    items: VIEW_MODE_OPTIONS,
                  }}
                  presetPlaceholder="Full data"
                />
              )}
            </div>
          </div>
        </div>
        {analyticsTab === 'comments' ? (
          <CommentsTab playlistId={playlistId} />
        ) : analyticsTab === 'insights' ? (
          <InsightsTab
            playlistId={playlistId}
            range={range}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
          />
        ) : analyticsTab === 'metrics' ? (
          <MetricsTab
            playlistId={playlistId}
            range={range}
            previousRange={previousRange}
            granularity={granularity}
            viewMode={viewMode}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
          />
        ) : analyticsTab === 'monetization' ? (
          <MonetizationTab
            playlistId={playlistId}
            range={range}
            previousRange={previousRange}
            granularity={granularity}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
          />
        ) : (
          <DiscoveryTab
            playlistId={playlistId}
            range={range}
            previousRange={previousRange}
            granularity={granularity}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
          />
        )}
      </div>
    </section>
  )
}

export default PlaylistDetail

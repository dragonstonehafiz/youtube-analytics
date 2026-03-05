import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ActionButton } from '../../components/ui'
import { DataRangeControl } from '../../components/features'
import { PageCard } from '../../components/cards'
import AnalyticsTab from './AnalyticsTab'
import MonetizationTab from './MonetizationTab'
import DiscoveryTab from './DiscoveryTab'
import CommentsTab from './CommentsTab'
import { formatDisplayDate } from '../../utils/date'
import { getStored, setStored } from '../../utils/storage'
import { useAnalyticsDateRange, GRANULARITY_OPTIONS } from '../../hooks/useAnalyticsDateRange'
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

export type VideoDailyRow = {
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

type Granularity = 'daily' | '7d' | '28d' | '90d' | 'monthly' | 'yearly'
type VideoDetailTab = 'analytics' | 'monetization' | 'discovery' | 'comments'
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

function VideoDetail() {
  const { videoId } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<VideoDetailTab>(getStored('videoDetailTab', 'analytics'))
  const [video, setVideo] = useState<VideoMetadata | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dailyRows, setDailyRows] = useState<VideoDailyRow[]>([])
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)
  const [granularity, setGranularity] = useState<Granularity>(getStored('videoDetailGranularity', 'daily'))
  const {
    years, setYears,
    mode, setMode,
    presetSelection, setPresetSelection,
    yearSelection, setYearSelection,
    monthSelection, setMonthSelection,
    customStart, setCustomStart,
    customEnd, setCustomEnd,
    range,
    previousRange,
    rangeOptions,
  } = useAnalyticsDateRange({ storageKey: 'videoDetailRange', loadYearsFromApi: false })

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
        const response = await fetch(`http://localhost:8000/videos/${videoId}`)
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
    async function loadVideoAnalytics() {
      if (!videoId) {
        setDailyRows([])
        setYears([])
        setAnalyticsError('Missing video ID.')
        return
      }
      setAnalyticsLoading(true)
      setAnalyticsError(null)
      try {
        const response = await fetch(`http://localhost:8000/analytics/video-daily?video_id=${videoId}&limit=10000`)
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
      } catch (err) {
        setAnalyticsError(err instanceof Error ? err.message : 'Failed to load analytics.')
      } finally {
        setAnalyticsLoading(false)
      }
    }
    loadVideoAnalytics()
  }, [videoId])

  useEffect(() => {
    setStored('videoDetailTab', activeTab)
  }, [activeTab])

  useEffect(() => {
    setStored('videoDetailGranularity', granularity)
  }, [granularity])

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
        {activeTab === 'analytics' && (
          <AnalyticsTab
            loading={analyticsLoading}
            error={analyticsError}
            granularity={granularity}
            dailyRows={dailyRows}
            range={range}
            previousRange={previousRange}
          />
        )}
        {activeTab === 'monetization' && (
          <MonetizationTab
            loading={analyticsLoading}
            error={analyticsError}
            granularity={granularity}
            dailyRows={dailyRows}
            range={range}
            previousRange={previousRange}
          />
        )}
        {activeTab === 'discovery' && (
          <DiscoveryTab
            videoId={videoId}
            range={range}
            previousRange={previousRange}
            granularity={granularity}
          />
        )}
        {activeTab === 'comments' && (
          <CommentsTab videoId={videoId} />
        )}
      </div>
    </section>
  )
}

export default VideoDetail

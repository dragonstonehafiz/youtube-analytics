import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ActionButton, StatCard, Textbox } from '../../components/ui'
import { DataRangeControl, type DateRangeValue } from '../../components/features'
import { fetchVideoYears } from '../../utils/years'
import { PageCard } from '../../components/cards'
import AnalyticsTab from './AnalyticsTab'
import EngagementTab from './EngagementTab'
import MonetizationTab from './MonetizationTab'
import DiscoveryTab from './DiscoveryTab'
import CommentsTab from './CommentsTab'
import { formatDisplayDate } from '../../utils/date'
import { getStored, setStored } from '../../utils/storage'
import { formatDuration } from '../../utils/number'
import '../shared.css'
import './VideoDetail.css'

type VideoMetadata = {
  id: string
  title: string
  description: string | null
  published_at: string | null
  views: number | null
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
  engaged_views: number | null
}

type VideoDetailTab = 'metrics' | 'engagement' | 'monetization' | 'discovery' | 'comments'
function VideoDetail() {
  const { videoId } = useParams()
  const navigate = useNavigate()
  const initialTab = getStored('videoDetailTab', 'metrics') as string
  const [activeTab, setActiveTab] = useState<VideoDetailTab>(
    (['metrics', 'engagement', 'monetization', 'discovery', 'comments'] as string[]).includes(initialTab)
      ? initialTab as VideoDetailTab
      : 'metrics'
  )
  const [video, setVideo] = useState<VideoMetadata | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dailyRows, setDailyRows] = useState<VideoDailyRow[]>([])
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)
  const [derivedYears, setDerivedYears] = useState<string[]>([])
  const [rangeValue, setRangeValue] = useState<DateRangeValue | null>(null)

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
      } catch (err) {
        setAnalyticsError(err instanceof Error ? err.message : 'Failed to load analytics.')
      } finally {
        setAnalyticsLoading(false)
      }
    }
    loadVideoAnalytics()
  }, [videoId])

  useEffect(() => {
    if (!videoId) {
      setDerivedYears([])
      return
    }
    fetchVideoYears(videoId).then(setDerivedYears).catch(() => setDerivedYears([]))
  }, [videoId])

  useEffect(() => {
    setStored('videoDetailTab', activeTab)
  }, [activeTab])

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
                    <Textbox value={video.description || ''} placeholder="This video does not have a description" height="250px"/>
                  </div>
                </div>
                <div className="video-detail-grid">
                  <StatCard label="Views" value={(video.views ?? 0).toLocaleString()} size = "smaller"/>
                  <StatCard label="Likes" value={(video.like_count ?? 0).toLocaleString()} size = "smaller"/>
                  <StatCard label="Comments" value={(video.comment_count ?? 0).toLocaleString()} size = "smaller"/>
                </div>
                <div className="video-detail-grid">
                  <StatCard label="Video ID" value={video.id} size = "smaller"/>
                  <StatCard label="Duration" value={formatDuration(video.duration_seconds)} size = "smaller"/>
                  <StatCard label="Visibility" value={video.privacy_status || '-'} size = "smaller"/>
                  <StatCard label="Content Type" value={video.content_type || '-'} size = "smaller"/>
                  <StatCard label="Published" value={formatDisplayDate(video.published_at)} size = "smaller" />
                </div>
              </div>
            ) : (
              <div className="video-detail-state">Video metadata</div>
            )}
          </PageCard>
        </div>
        {activeTab !== 'comments' && (
          <div className="page-row">
            <div className="analytics-range-controls">
              <DataRangeControl
                storageKey="videoDetailRange"
                years={derivedYears}
                presetPlaceholder="Full data"
                onChange={setRangeValue}
              />
            </div>
          </div>
        )}
        <div className="analytics-tab-row">
          <button
            type="button"
            className={activeTab === 'metrics' ? 'analytics-tab active' : 'analytics-tab'}
            onClick={() => setActiveTab('metrics')}
          >
            Metrics
          </button>
          <button
            type="button"
            className={activeTab === 'engagement' ? 'analytics-tab active' : 'analytics-tab'}
            onClick={() => setActiveTab('engagement')}
          >
            Engagement
          </button>
          <button
            type="button"
            className={activeTab === 'monetization' ? 'analytics-tab active' : 'analytics-tab'}
            onClick={() => setActiveTab('monetization')}
          >
            Monetization
          </button>
          <button
            type="button"
            className={activeTab === 'discovery' ? 'analytics-tab active' : 'analytics-tab'}
            onClick={() => setActiveTab('discovery')}
          >
            Discovery
          </button>
          <button
            type="button"
            className={activeTab === 'comments' ? 'analytics-tab active' : 'analytics-tab'}
            onClick={() => setActiveTab('comments')}
          >
            Comments
          </button>
        </div>
        {rangeValue && activeTab === 'metrics' && (
          <AnalyticsTab
            loading={analyticsLoading}
            error={analyticsError}
            granularity={rangeValue.granularity}
            dailyRows={dailyRows}
            range={rangeValue.range}
            previousRange={rangeValue.previousRange}
          />
        )}
        {rangeValue && activeTab === 'engagement' && (
          <EngagementTab
            loading={analyticsLoading}
            error={analyticsError}
            granularity={rangeValue.granularity}
            dailyRows={dailyRows}
            range={rangeValue.range}
            previousRange={rangeValue.previousRange}
          />
        )}
        {rangeValue && activeTab === 'monetization' && (
          <MonetizationTab
            loading={analyticsLoading}
            error={analyticsError}
            granularity={rangeValue.granularity}
            dailyRows={dailyRows}
            range={rangeValue.range}
            previousRange={rangeValue.previousRange}
          />
        )}
        {rangeValue && activeTab === 'discovery' && (
          <DiscoveryTab
            videoId={videoId}
            range={rangeValue.range}
            previousRange={rangeValue.previousRange}
            granularity={rangeValue.granularity}
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

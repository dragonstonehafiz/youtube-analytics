import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ActionButton, StatCard, Textbox, VideoThumbnail, DisplayVideoTitle, DisplayDate } from '@components/ui'
import { DataRangeControl, type DateRangeValue } from '@components/features'
import { fetchVideoYears } from '@utils/years'
import { PageCard } from '@components/cards'
import AnalyticsTab from './AnalyticsTab'
import EngagementTab from './EngagementTab'
import MonetizationTab from './MonetizationTab'
import DiscoveryTab from './DiscoveryTab'
import CommentsTab from './CommentsTab'
import { getStored, setStored } from '@utils/storage'
import { formatDuration } from '@utils/number'
import { parseVideoDetailTab, VIDEO_DETAIL_TABS } from './utils'
import type { VideoDetailTab, VideoMetadata } from '@types'
import '../shared.css'
import './VideoDetail.css'

function VideoDetail() {
  const { videoId } = useParams()
  const navigate = useNavigate()
  const initialTab = getStored('videoDetailTab', 'metrics') as string
  const [activeTab, setActiveTab] = useState<VideoDetailTab>(parseVideoDetailTab(initialTab))
  const [video, setVideo] = useState<VideoMetadata | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    if (!videoId) {
      setDerivedYears([])
      return
    }
    fetchVideoYears(videoId).then(setDerivedYears).catch(() => setDerivedYears([]))
  }, [videoId])

  useEffect(() => {
    setStored('videoDetailTab', activeTab)
  }, [activeTab])

  const activeTabContent = (() => {
    if (activeTab === 'comments') {
      return <CommentsTab videoId={videoId} />
    }
    if (!rangeValue) {
      return null
    }
    const sharedTabProps = {
      videoId,
      granularity: rangeValue.granularity,
      range: rangeValue.range,
      previousRange: rangeValue.previousRange,
    }
    switch (activeTab) {
      case 'metrics':
        return <AnalyticsTab {...sharedTabProps} />
      case 'engagement':
        return <EngagementTab {...sharedTabProps} />
      case 'monetization':
        return <MonetizationTab {...sharedTabProps} />
      case 'discovery':
        return (
          <DiscoveryTab
            videoId={videoId}
            range={rangeValue.range}
            previousRange={rangeValue.previousRange}
            granularity={rangeValue.granularity}
          />
        )
      default:
        return null
    }
  })()

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
                  <VideoThumbnail url={video.thumbnail_url} title={video.title} className="video-detail-thumb" />
                  <div className="video-detail-meta-content">
                    <div className="video-detail-title"><DisplayVideoTitle title={video.title} /></div>
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
                  <StatCard label="Published" value={<DisplayDate date={video.published_at} />} size = "smaller" />
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
          {VIDEO_DETAIL_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={activeTab === tab.key ? 'analytics-tab active' : 'analytics-tab'}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeTabContent}
      </div>
    </section>
  )
}

export default VideoDetail

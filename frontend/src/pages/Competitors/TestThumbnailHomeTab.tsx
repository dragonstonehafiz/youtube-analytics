import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageCard } from '../../components/cards'
import { formatDisplayDate } from '../../utils/date'
import { getStored, setStored } from '../../utils/storage'
import ThumbnailUploader from './ThumbnailUploader'
import UserVideoSelector from './UserVideoSelector'
import type { ThumbnailTabProps, CompetitorVideoRow } from './types'
import useUserVideoState from './useUserVideoState'
import { insertThumbnailsAtRandom, shuffleArray } from './utils'

type Category = {
  id: string
  label: string
}

const CATEGORIES: Category[] = [
  { id: 'all', label: 'All' },
  { id: 'music', label: 'Music' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'anime', label: 'Anime' },
  { id: 'tech', label: 'Tech' },
  { id: 'education', label: 'Education' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'news', label: 'News' },
]

function TestThumbnailHome({ thumbnailTitle, setThumbnailTitle, thumbnails, setThumbnails }: ThumbnailTabProps) {
  const [allVideos, setAllVideos] = useState<CompetitorVideoRow[]>([])
  const [selectedCategory, setSelectedCategory] = useState(getStored('thumbnailTestCategory', 'all'))
  const [loading, setLoading] = useState(true)

  const {
    userVideoSource,
    setUserVideoSource,
    userVideoPlaylist,
    setUserVideoPlaylist,
    userVideoSelectionMode,
    setUserVideoSelectionMode,
    userVideoPercentileRange,
    setUserVideoPercentileRange,
    userVideoCount,
    setUserVideoCount,
    userVideos,
    handleUserVideosSelected,
  } = useUserVideoState()

  const fetchVideos = useCallback(async (title: string = '') => {
    try {
      setLoading(true)
      // Fetch regular videos and shorts separately to ensure we always have both
      const videoParams = new URLSearchParams({ title, limit: '20', content_type: 'video' })
      const shortsParams = new URLSearchParams({ title, limit: '20', content_type: 'short' })

      const [videoResponse, shortsResponse] = await Promise.all([
        fetch(`http://localhost:8000/competitors/related-videos?${videoParams.toString()}`),
        fetch(`http://localhost:8000/competitors/related-videos?${shortsParams.toString()}`),
      ])

      const videoData = await videoResponse.json()
      const shortsData = await shortsResponse.json()

      const allVideos = [
        ...(Array.isArray(videoData.items) ? videoData.items : []),
        ...(Array.isArray(shortsData.items) ? shortsData.items : []),
      ]

      setAllVideos(allVideos)
    } catch (error) {
      console.error('Failed to load videos', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Load initial videos on mount
    fetchVideos('')
  }, [fetchVideos])

  const handleGetVideos = useCallback(() => {
    fetchVideos('')
  }, [fetchVideos])

  useEffect(() => {
    setStored('thumbnailTestCategory', selectedCategory)
  }, [selectedCategory])

  // Always use all available videos (competitor + user), arrange in home layout
  const renderContent = useMemo(() => {
    const combined = [...allVideos, ...userVideos]
    const allRegularVideos = combined.filter((v) => v.content_type !== 'short')
    const allShorts = combined.filter((v) => v.content_type !== 'short')

    const regularVideos = insertThumbnailsAtRandom(
      shuffleArray(allRegularVideos),
      thumbnails,
      thumbnailTitle,
    )
    const shorts = shuffleArray(allShorts)

    if (loading && combined.length === 0) {
      return <div className="thumbnail-loading">Loading videos...</div>
    }

    if (combined.length === 0) {
      return <div className="thumbnail-empty">No videos found.</div>
    }

    const content = []
    let videoIndex = 0
    let shortIndex = 0

    // Pattern: 2 rows of 4 videos (8 total) → 5 shorts → repeat
    while (videoIndex < regularVideos.length || shortIndex < shorts.length) {
      // 2 rows of 4 regular videos
      if (videoIndex < regularVideos.length) {
        content.push(
          <div key={`regular-${videoIndex}`} className="thumbnail-grid">
            {regularVideos.slice(videoIndex, videoIndex + 4).map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        )
        videoIndex += 4
      }

      if (videoIndex < regularVideos.length) {
        content.push(
          <div key={`regular-${videoIndex}`} className="thumbnail-grid">
            {regularVideos.slice(videoIndex, videoIndex + 4).map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        )
        videoIndex += 4
      }

      // 5 shorts
      if (shortIndex < shorts.length) {
        content.push(
          <div key={`shorts-${shortIndex}`} className="thumbnail-shorts-grid">
            {shorts.slice(shortIndex, shortIndex + 5).map((video) => (
              <VideoCard key={video.id} video={video} isShort />
            ))}
          </div>
        )
        shortIndex += 5
      }
    }

    return content
  }, [allVideos, userVideos, thumbnails, thumbnailTitle, loading])

  return (
    <div className="page-body">
      <div className="page-row">
        <ThumbnailUploader
          title={thumbnailTitle}
          setTitle={setThumbnailTitle}
          thumbnails={thumbnails}
          setThumbnails={setThumbnails}
          onReloadThumbnails={handleGetVideos}
        />
      </div>
      <div className="page-row">
        <UserVideoSelector
          selectedSource={userVideoSource}
          setSelectedSource={setUserVideoSource}
          selectedPlaylist={userVideoPlaylist}
          setSelectedPlaylist={setUserVideoPlaylist}
          selectionMode={userVideoSelectionMode}
          setSelectionMode={setUserVideoSelectionMode}
          percentileRange={userVideoPercentileRange}
          setPercentileRange={setUserVideoPercentileRange}
          videoCount={userVideoCount}
          setVideoCount={setUserVideoCount}
          selectedVideos={userVideos}
          onVideosSelected={handleUserVideosSelected}
        />
      </div>
      <div className="page-row">
        <PageCard>
          <div className="thumbnail-home-container">
          <div className="thumbnail-categories-wrapper">
            <div className="thumbnail-categories">
              {CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={selectedCategory === category.id ? 'thumbnail-category-button active' : 'thumbnail-category-button'}
                  onClick={() => setSelectedCategory(category.id)}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>

          <div className="thumbnail-videos-content">{renderContent}</div>
          </div>
        </PageCard>
      </div>
    </div>
  )
}

function VideoCard({ video, isShort = false }: { video: CompetitorVideoRow; isShort?: boolean }) {
  return (
    <div className={isShort ? 'thumbnail-short-card' : 'thumbnail-video-card'}>
      <div className={isShort ? 'thumbnail-short-image-wrapper' : 'thumbnail-image-wrapper'}>
        {video.thumbnail_url ? (
          <img src={video.thumbnail_url} alt={video.title} className="thumbnail-image" />
        ) : (
          <div className="thumbnail-image-placeholder" />
        )}
      </div>
      <div className="thumbnail-video-info">
        <h3 className="thumbnail-video-title">{video.title}</h3>
        <div className="thumbnail-video-metadata">
          <span className="thumbnail-channel-name">{video.channel_title ?? 'Unknown'}</span>
          <div className="thumbnail-video-stats">
            <span>{(video.view_count ?? 0).toLocaleString()} views</span>
            <span>•</span>
            <span>{formatDisplayDate(video.published_at)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TestThumbnailHome

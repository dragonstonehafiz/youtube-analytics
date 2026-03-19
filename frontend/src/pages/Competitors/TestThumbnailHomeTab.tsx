import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageCard } from '@components/cards'
import { formatDisplayDate } from '@utils/date'
import { getStored, setStored } from '@utils/storage'
import ThumbnailUploader from './ThumbnailUploader'
import type { CompetitorVideoRow } from '@types'
import { fetchCompetitorVideoBuckets, insertThumbnailsAtRandom, shuffleArray } from './utils'

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

function TestThumbnailHome() {
  const [allVideos, setAllVideos] = useState<CompetitorVideoRow[]>([])
  const [selectedCategory, setSelectedCategory] = useState(getStored('thumbnailTestCategory', 'all'))
  const [loading, setLoading] = useState(true)

  const fetchVideos = useCallback(async (title: string = '') => {
    if (!title.trim()) {
      setAllVideos([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const includeShorts = getStored<boolean>('includeShorts', false)
      const numVideosToInclude = getStored('numVideosToInclude', '')
      const numShortsToInclude = getStored('numShortsToInclude', '')
      const { videos, shorts } = await fetchCompetitorVideoBuckets(title, includeShorts, numVideosToInclude || 24, numShortsToInclude || 10)

      const allVideos = [
        ...shuffleArray(videos),
        ...shuffleArray(shorts),
      ]

      setAllVideos(allVideos)
    } catch (error) {
      console.error('Failed to load videos', error)
    } finally {
      setLoading(false)
    }
     
  }, [])


  const handleGetVideos = useCallback(() => {
    const currentTitle = getStored('thumbnailTitle', '')
    fetchVideos(currentTitle)
  }, [fetchVideos])

  useEffect(() => {
    // Load initial videos on mount only
    const title = getStored('thumbnailTitle', '')
    fetchVideos(title)
  }, [fetchVideos])

  useEffect(() => {
    setStored('thumbnailTestCategory', selectedCategory)
  }, [selectedCategory])

  // Arrange competitor videos in home layout
  const renderContent = useMemo(() => {
    const thumbnails = JSON.parse(getStored('thumbnails', '[]') as string)
    const thumbnailTitle = getStored('thumbnailTitle', '')
    const allRegularVideos = allVideos.filter((v) => v.content_type !== 'short')
    const allShorts = allVideos.filter((v) => v.content_type === 'short')

    const regularVideos = insertThumbnailsAtRandom(
      allRegularVideos,
      thumbnails,
      thumbnailTitle,
    )
    const shorts = allShorts

    if (loading && allVideos.length === 0) {
      return <div className="thumbnail-loading">Loading videos...</div>
    }

    if (allVideos.length === 0) {
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
  }, [allVideos, loading])

  return (
    <div className="page-body">
      <div className="page-row">
        <ThumbnailUploader onReloadThumbnails={handleGetVideos} />
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
            <span>{(video.views ?? 0).toLocaleString()} views</span>
            <span>•</span>
            <span>{formatDisplayDate(video.published_at)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TestThumbnailHome

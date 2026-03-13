import { useCallback, useEffect, useState } from 'react'
import { PageCard } from '../../components/cards'
import { formatDisplayDate } from '../../utils/date'
import { getStored, setStored } from '../../utils/storage'
import ThumbnailUploader from './ThumbnailUploader'
import type { ThumbnailTabProps, CompetitorVideoRow } from './types'
import { insertThumbnailsAtRandom } from './utils'

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

  const fetchVideos = useCallback(async (title: string = '') => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ title, limit: '20' })
      const response = await fetch(`http://localhost:8000/competitors/related-videos?${params.toString()}`)
      const data = await response.json()
      const allVideos = Array.isArray(data.items) ? data.items : []

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

  const handleGetVideos = () => {
    fetchVideos('')
  }

  useEffect(() => {
    setStored('thumbnailTestCategory', selectedCategory)
  }, [selectedCategory])

  const regularVideos = insertThumbnailsAtRandom(
    allVideos.filter((v) => v.content_type !== 'short').slice(0, 12),
    thumbnails,
    thumbnailTitle,
  )
  const shorts = allVideos.filter((v) => v.content_type === 'short').slice(0, 5) // First 5 shorts

  const renderContent = () => {
    if (loading) {
      return <div className="thumbnail-loading">Loading videos...</div>
    }

    if (allVideos.length === 0) {
      return <div className="thumbnail-empty">No videos found.</div>
    }

    const content = []

    // Pattern: 2 rows of regular (6 videos) → 1 row of shorts (5 videos) → 2 rows of regular (6 videos)
    // First 2 rows (6 regular videos)
    if (regularVideos.length > 0) {
      content.push(
        <div key="regular-1" className="thumbnail-grid">
          {regularVideos.slice(0, 3).map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      )
    }

    if (regularVideos.length > 3) {
      content.push(
        <div key="regular-2" className="thumbnail-grid">
          {regularVideos.slice(3, 6).map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      )
    }

    // Shorts row (5 shorts)
    if (shorts.length > 0) {
      content.push(
        <div key="shorts-section" className="thumbnail-shorts-grid">
          {shorts.map((video) => (
            <VideoCard key={video.id} video={video} isShort />
          ))}
        </div>
      )
    }

    // Last 2 rows (6 regular videos)
    if (regularVideos.length > 6) {
      content.push(
        <div key="regular-3" className="thumbnail-grid">
          {regularVideos.slice(6, 9).map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      )
    }

    if (regularVideos.length > 9) {
      content.push(
        <div key="regular-4" className="thumbnail-grid">
          {regularVideos.slice(9, 12).map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      )
    }

    return content
  }

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

          <div className="thumbnail-videos-content">{renderContent()}</div>
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

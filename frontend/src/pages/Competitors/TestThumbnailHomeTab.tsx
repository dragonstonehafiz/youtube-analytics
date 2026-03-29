import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageCard, ProfileImage } from '@components/ui'
import { formatDisplayDate } from '@utils/date'
import { getStored, setStored } from '@utils/storage'
import { loadThumbnails } from '@utils/indexedDB'
import ThumbnailUploader from './ThumbnailUploader'
import type { CompetitorVideoRow, Thumbnail } from '@types'
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

// Initialize thumbnails from localStorage for immediate access
function initThumbnails(): Thumbnail[] {
  try {
    return JSON.parse(getStored('thumbnails', '[]') as string)
  } catch {
    return []
  }
}

function TestThumbnailHome() {
  const [allVideos, setAllVideos] = useState<CompetitorVideoRow[]>([])
  const [selectedCategory, setSelectedCategory] = useState(getStored('thumbnailTestCategory', 'all'))
  const [loading, setLoading] = useState(true)
  const [channelName, setChannelName] = useState<string>('Your Channel')
  const [channelAvatarUrl, setChannelAvatarUrl] = useState<string | null>(null)
  const [uploadedThumbnails, setUploadedThumbnails] = useState<Thumbnail[]>(initThumbnails())

  const fetchVideos = useCallback(async (title: string = '') => {
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

    // Fetch channel info
    fetch('http://localhost:8000/me')
      .then((res) => res.json())
      .then((data) => {
        setChannelName(data.title || 'Your Channel')
        setChannelAvatarUrl(data.thumbnail_url || null)
      })
      .catch((error) => console.error('Failed to load channel info', error))

    // Sync thumbnails from IndexedDB (update if different from localStorage)
    loadThumbnails().then((loaded) => {
      if (loaded.length > 0 && loaded.length !== uploadedThumbnails.length) {
        setUploadedThumbnails(loaded)
      }
    })
  }, [fetchVideos])

  useEffect(() => {
    setStored('thumbnailTestCategory', selectedCategory)
  }, [selectedCategory])

  // Arrange competitor videos in home layout
  const renderContent = useMemo(() => {
    const thumbnailTitle = getStored('thumbnailTitle', '')
    const allRegularVideos = allVideos.filter((v) => v.content_type !== 'short')
    const allShorts = allVideos.filter((v) => v.content_type === 'short')

    const regularVideos = insertThumbnailsAtRandom(
      allRegularVideos,
      uploadedThumbnails,
      thumbnailTitle,
      channelName,
      channelAvatarUrl,
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
              <VideoCard key={video.id} video={video} isShort avatarUrl={channelAvatarUrl} channelName={channelName} />
            ))}
          </div>
        )
        shortIndex += 5
      }
    }

    return content
  }, [allVideos, loading, channelName, channelAvatarUrl, uploadedThumbnails])

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
          <div className="thumbnail-channel-info">
            {video.channel_avatar_url !== undefined && (
              <ProfileImage src={video.channel_avatar_url ?? null} name={video.channel_title} size={24} />
            )}
            <span className="thumbnail-channel-name">{video.channel_title ?? 'Unknown'}</span>
          </div>
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

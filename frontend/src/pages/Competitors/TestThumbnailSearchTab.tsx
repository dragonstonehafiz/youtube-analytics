import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageCard, ProfileImage } from '@components/ui'
import { getStored } from '@utils/storage'
import { loadThumbnails } from '@utils/indexedDB'
import ThumbnailUploader from './ThumbnailUploader'
import type { CompetitorVideoRow, Thumbnail } from '@types'
import { fetchCompetitorVideoBuckets, formatCompactViewCount, formatRelativeUploadAge, insertThumbnailsAtRandom, shuffleArray } from './utils'
import './TestThumbnailSearchTab.css'

const FILTER_BUTTONS = ['All', 'Shorts', 'Videos', 'Unwatched', 'Watched', 'Recently uploaded', 'Live']

function initThumbnails(): Thumbnail[] {
  try {
    return JSON.parse(getStored('thumbnails', '[]') as string)
  } catch {
    return []
  }
}

function TestThumbnailSearchTab() {
  const [videos, setVideos] = useState<CompetitorVideoRow[]>([])
  const [shorts, setShorts] = useState<CompetitorVideoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('All')
  const [channelName, setChannelName] = useState<string>('Your Channel')
  const [channelAvatarUrl, setChannelAvatarUrl] = useState<string | null>(null)
  const [uploadedThumbnails, setUploadedThumbnails] = useState<Thumbnail[]>(initThumbnails())

  const fetchVideos = useCallback(async (title: string = '') => {
    try {
      setLoading(true)
      const includeShorts = getStored<boolean>('includeShorts', false)
      const numVideosToInclude = getStored('numVideosToInclude', '')
      const numShortsToInclude = getStored('numShortsToInclude', '')
      const { videos: allVideos, shorts: shortVideos } = await fetchCompetitorVideoBuckets(title, includeShorts, numVideosToInclude || 20, numShortsToInclude || 10)

      const thumbnailTitle = getStored('thumbnailTitle', '')
      const regularVideos = insertThumbnailsAtRandom(
        allVideos.slice(0, 10),
        uploadedThumbnails,
        thumbnailTitle,
        channelName,
        channelAvatarUrl,
      )

      setVideos(regularVideos)
      setShorts(shortVideos.slice(0, 10))
    } catch (error) {
      console.error('Failed to load videos', error)
    } finally {
      setLoading(false)
    }
  }, [channelName, channelAvatarUrl, uploadedThumbnails])

  const handleGetVideos = useCallback(() => {
    const currentTitle = getStored('thumbnailTitle', '')
    fetchVideos(currentTitle)
  }, [fetchVideos])

  useEffect(() => {
    const title = getStored('thumbnailTitle', '')
    fetchVideos(title)

    fetch('http://localhost:8000/me')
      .then((res) => res.json())
      .then((data) => {
        setChannelName(data.title || 'Your Channel')
        setChannelAvatarUrl(data.thumbnail_url || null)
      })
      .catch((error) => console.error('Failed to load channel info', error))

    loadThumbnails().then((loaded) => {
      if (loaded.length > 0 && loaded.length !== uploadedThumbnails.length) {
        setUploadedThumbnails(loaded)
      }
    })
  }, [fetchVideos, uploadedThumbnails.length])

  const { allVideosCombined, allShortsCombined } = useMemo(() => ({
    allVideosCombined: shuffleArray(videos),
    allShortsCombined: shuffleArray(shorts),
  }), [videos, shorts])

  const renderVideo = (video: CompetitorVideoRow) => (
    <div key={video.id} className="thumbnail-search-result">
      <div className="thumbnail-search-thumbnail">
        {video.thumbnail_url ? (
          <img src={video.thumbnail_url} alt={video.title} />
        ) : (
          <div className="thumbnail-image-placeholder" />
        )}
        <span className="thumbnail-search-duration">8:09</span>
      </div>
      <div className="thumbnail-search-info">
        <h3 className="thumbnail-search-title">{video.title}</h3>
        <div className="thumbnail-search-metadata">
          <div className="thumbnail-channel-info">
            {video.channel_avatar_url !== undefined && (
              <ProfileImage src={video.channel_avatar_url ?? null} name={video.channel_title} size={24} />
            )}
            <span className="thumbnail-search-channel">{video.channel_title ?? 'Unknown'}</span>
          </div>
          <div className="thumbnail-search-stats">
            <span>{formatCompactViewCount(video.views)} views</span>
            <span>{formatRelativeUploadAge(video.published_at, { short: true })}</span>
          </div>
        </div>
        {video.description && <p className="thumbnail-search-description">{video.description}</p>}
      </div>
    </div>
  )

  const getFilteredResults = () => {
    if (activeFilter === 'All') {
      return [...allVideosCombined, ...allShortsCombined]
    }
    if (activeFilter === 'Videos') {
      return allVideosCombined
    }
    if (activeFilter === 'Shorts') {
      return allShortsCombined
    }
    return []
  }

  const filteredResults = getFilteredResults()

  return (
    <div className="page-body">
      <div className="page-row">
        <ThumbnailUploader onReloadThumbnails={handleGetVideos} />
      </div>
      <div className="page-row">
        <PageCard>
          <div className="thumbnail-search-container">
            {loading && <div className="thumbnail-loading">Loading search results...</div>}

            <div className="thumbnail-search-filters">
              {FILTER_BUTTONS.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={activeFilter === filter ? 'thumbnail-search-filter active' : 'thumbnail-search-filter'}
                  onClick={() => setActiveFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </div>

            {filteredResults.length > 0 ? (
              <div className="thumbnail-search-section">{filteredResults.map(renderVideo)}</div>
            ) : (
              !loading && <div className="thumbnail-loading">No results found for this filter.</div>
            )}
          </div>
        </PageCard>
      </div>
    </div>
  )
}

export default TestThumbnailSearchTab

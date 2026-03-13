import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageCard } from '../../components/cards'
import { formatDisplayDate } from '../../utils/date'
import { getStored } from '../../utils/storage'
import ThumbnailUploader from './ThumbnailUploader'
import type { CompetitorVideoRow } from './types'
import { fetchCompetitorVideoBuckets, insertThumbnailsAtRandom, shuffleArray } from './utils'
import './TestThumbnailSearchTab.css'

const FILTER_BUTTONS = ['All', 'Shorts', 'Videos', 'Unwatched', 'Watched', 'Recently uploaded', 'Live']

function TestThumbnailSearchTab() {
  const [videos, setVideos] = useState<CompetitorVideoRow[]>([])
  const [shorts, setShorts] = useState<CompetitorVideoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('All')

  const fetchVideos = useCallback(async (title: string = '') => {
    if (!title.trim()) {
      setVideos([])
      setShorts([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const includeShorts = getStored<boolean>('includeShorts', false)
      const numVideosToInclude = getStored('numVideosToInclude', '')
      const numShortsToInclude = getStored('numShortsToInclude', '')
      const { videos: allVideos, shorts: shortVideos } = await fetchCompetitorVideoBuckets(title, includeShorts, numVideosToInclude || 20, numShortsToInclude || 10)

      const thumbnails = JSON.parse(getStored('thumbnails', '[]') as string)
      const thumbnailTitle = getStored('thumbnailTitle', '')
      const regularVideos = insertThumbnailsAtRandom(
        allVideos.slice(0, 10),
        thumbnails,
        thumbnailTitle,
      )

      setVideos(regularVideos)
      setShorts(shortVideos.slice(0, 10))
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

  // Use competitor videos only
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
          <span className="thumbnail-search-channel">{video.channel_title ?? 'Unknown'}</span>
          <div className="thumbnail-search-stats">
            <span>{(video.views ?? 0).toLocaleString()} views</span>
            <span>•</span>
            <span>{formatDisplayDate(video.published_at)}</span>
          </div>
        </div>
        {video.description && <p className="thumbnail-search-description">{video.description}</p>}
      </div>
    </div>
  )

  // Combine filtered results
  const getFilteredResults = () => {
    if (activeFilter === 'All') {
      return [...allVideosCombined, ...allShortsCombined]
    } else if (activeFilter === 'Videos') {
      return allVideosCombined
    } else if (activeFilter === 'Shorts') {
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

          {/* Filter Buttons */}
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

          {/* Results */}
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

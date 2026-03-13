import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageCard } from '../../components/cards'
import { formatDisplayDate } from '../../utils/date'
import ThumbnailUploader from './ThumbnailUploader'
import type { ThumbnailTabProps, CompetitorVideoRow } from './types'
import { fetchCompetitorVideoBuckets, insertThumbnailsAtRandom, shuffleArray } from './utils'
import './TestThumbnailSearchTab.css'

const FILTER_BUTTONS = ['All', 'Shorts', 'Videos', 'Unwatched', 'Watched', 'Recently uploaded', 'Live']

function TestThumbnailSearchTab({ thumbnailTitle, setThumbnailTitle, thumbnails, setThumbnails, includeShorts = false, setIncludeShorts }: ThumbnailTabProps) {
  const [videos, setVideos] = useState<CompetitorVideoRow[]>([])
  const [shorts, setShorts] = useState<CompetitorVideoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('All')

  const fetchVideos = useCallback(async (title: string = '') => {
    try {
      setLoading(true)
      const { videos: allVideos, shorts: shortVideos } = await fetchCompetitorVideoBuckets(title, includeShorts, 20, 10)

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
  }, [thumbnails, thumbnailTitle, includeShorts])


  const handleGetVideos = useCallback(() => {
    fetchVideos(thumbnailTitle)
  }, [fetchVideos, thumbnailTitle])

  useEffect(() => {
    // Load initial videos on mount using the stored title
    fetchVideos(thumbnailTitle)
  }, [fetchVideos, thumbnailTitle])

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
        <ThumbnailUploader
          title={thumbnailTitle}
          setTitle={setThumbnailTitle}
          thumbnails={thumbnails}
          setThumbnails={setThumbnails}
          onReloadThumbnails={handleGetVideos}
          includeShorts={includeShorts}
          setIncludeShorts={setIncludeShorts}
        />
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

import { useCallback, useEffect, useState } from 'react'
import { PageCard } from '../../components/cards'
import { formatDisplayDate } from '../../utils/date'
import ThumbnailUploader from './ThumbnailUploader'
import type { ThumbnailTabProps, CompetitorVideoRow } from './types'
import { insertThumbnailsAtRandom } from './utils'
import './TestThumbnailSearchTab.css'

const FILTER_BUTTONS = ['All', 'Shorts', 'Videos', 'Unwatched', 'Watched', 'Recently uploaded', 'Live']

function TestThumbnailSearchTab({ thumbnailTitle, setThumbnailTitle, thumbnails, setThumbnails }: ThumbnailTabProps) {
  const [videos, setVideos] = useState<CompetitorVideoRow[]>([])
  const [shorts, setShorts] = useState<CompetitorVideoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('All')

  const fetchVideos = useCallback(async (title: string = '') => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ title, limit: '20' })
      const response = await fetch(`http://localhost:8000/competitors/related-videos?${params.toString()}`)
      const data = await response.json()
      const allVideos = Array.isArray(data.items) ? data.items : []

      const regularVideos = insertThumbnailsAtRandom(
        allVideos.filter((v: CompetitorVideoRow) => v.content_type !== 'short').slice(0, 10),
        thumbnails,
        thumbnailTitle,
      )
      const shortVideos = allVideos.filter((v: CompetitorVideoRow) => v.content_type === 'short').slice(0, 10)

      setVideos(regularVideos)
      setShorts(shortVideos)
    } catch (error) {
      console.error('Failed to load videos', error)
    } finally {
      setLoading(false)
    }
  }, [thumbnails, thumbnailTitle])

  useEffect(() => {
    // Load initial videos on mount
    fetchVideos('')
  }, [fetchVideos])

  const handleGetVideos = () => {
    fetchVideos('')
  }

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
            <span>{(video.view_count ?? 0).toLocaleString()} views</span>
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
      return [...videos, ...shorts]
    } else if (activeFilter === 'Videos') {
      return videos
    } else if (activeFilter === 'Shorts') {
      return shorts
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

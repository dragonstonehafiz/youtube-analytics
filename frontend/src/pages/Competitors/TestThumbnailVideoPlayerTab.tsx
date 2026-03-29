import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageCard } from '@components/ui'
import { ProfileImage } from '@components/ui'
import { formatDisplayDate } from '@utils/date'
import { getStored } from '@utils/storage'
import ThumbnailUploader from './ThumbnailUploader'
import type { CompetitorVideoRow } from '@types'
import { fetchCompetitorVideoBuckets, insertThumbnailsAtRandom, shuffleArray } from './utils'
import './TestThumbnailVideoPlayerTab.css'

const SAMPLE_COMMENT_TEXTS = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.',
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia.',
  'Nulla facilisi. Cras non velit nec insit tempor feugiat non magnis.',
  'Pellentesque habitant morbi tristique senectus et netus et malesuada fames.',
  'Vestibulum tortor quam, feugiat vitae, ultricies eget, consequat quis.',
  'Integer posuere erat a ante venenatis dapibus posuere velit aliquet.',
  'Aenean lacinia bibendum nulla sed consectetur. Praesent commodo cursus magna.',
  'Vivamus suscipit tortor eget felis porttitor volutpat. Cras ultricies libero.',
  'Donec sollicitudin molestie malesuada. Nulla porttitor accumsan tincidunt.',
  'Mauris blandit aliquet elit, eget tincidunt nibh pulvinar a. Sed porttitor.',
]

const generateSampleComments = () => {
  return SAMPLE_COMMENT_TEXTS.map((text, idx) => ({
    author: `User ${idx + 1}`,
    text,
    likes: Math.floor(Math.random() * 1000) + 100,
    timeAgo: ['1 day ago', '2 days ago', '3 days ago', '4 hours ago', '2 hours ago', '6 hours ago', '12 hours ago', '18 hours ago'][idx % 8],
  }))
}

const SAMPLE_COMMENTS = generateSampleComments()

function TestThumbnailVideoPlayerTab() {
  const [videos, setVideos] = useState<CompetitorVideoRow[]>([])
  const [shorts, setShorts] = useState<CompetitorVideoRow[]>([])
  const [selectedVideo, setSelectedVideo] = useState<CompetitorVideoRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)

  const fetchVideos = useCallback(async (title: string = '') => {
    try {
      setLoading(true)
      const includeShorts = getStored<boolean>('includeShorts', false)
      const numVideosToInclude = getStored('numVideosToInclude', '')
      const numShortsToInclude = getStored('numShortsToInclude', '')
      const { videos: allVideos, shorts: shortVideos } = await fetchCompetitorVideoBuckets(title, includeShorts, numVideosToInclude || 100, numShortsToInclude || 3)

      // First, get user's most viewed video if not already loaded
      if (!selectedVideo) {
        try {
          const myVideoResponse = await fetch('http://localhost:8000/videos?limit=1&sort=views&direction=desc')
          const myVideoData = await myVideoResponse.json()
          if (Array.isArray(myVideoData.items) && myVideoData.items.length > 0) {
            setSelectedVideo(myVideoData.items[0] as CompetitorVideoRow)
          }
        } catch (error) {
          console.error('Failed to load top video', error)
        }
      }

      const thumbnails = JSON.parse(getStored('thumbnails', '[]') as string)
      const thumbnailTitle = getStored('thumbnailTitle', '')
      const regularVideos = insertThumbnailsAtRandom(
        allVideos.slice(0, 20),
        thumbnails,
        thumbnailTitle,
      )

      setVideos(regularVideos)
      setShorts(shortVideos.slice(0, 3))
    } catch (error) {
      console.error('Failed to load videos', error)
    } finally {
      setLoading(false)
    }
  }, [selectedVideo])


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

  // Build sidebar with videos and shorts
  const sidebarItems = useMemo(() => {
    const sidebar: { type: string; data: CompetitorVideoRow | CompetitorVideoRow[] }[] = []
    const allItems = [...allVideosCombined]

    // Add first 4 videos
    allItems.slice(0, 4).forEach((video) => {
      sidebar.push({ type: 'video', data: video })
    })

    // Add shorts section after first 4 videos
    if (allShortsCombined.length > 0) {
      sidebar.push({ type: 'shorts-section', data: allShortsCombined })
    }

    // Add remaining videos
    allItems.slice(4).forEach((video) => {
      sidebar.push({ type: 'video', data: video })
    })

    return sidebar
  }, [allVideosCombined, allShortsCombined])

  return (
    <div className="page-body">
      <div className="page-row">
        <ThumbnailUploader onReloadThumbnails={handleGetVideos} />
      </div>
      <div className="page-row">
        <PageCard>
          {loading ? (
            <div className="thumbnail-loading">Loading...</div>
          ) : (
          <div className="thumbnail-player-wrapper">
          <div className="thumbnail-player-main">
            {/* Video Player */}
            <div className="thumbnail-player-video">
              {selectedVideo?.thumbnail_url ? (
                <img src={selectedVideo.thumbnail_url} alt={selectedVideo.title} className="thumbnail-player-image" />
              ) : (
                <div className="thumbnail-player-placeholder" />
              )}
            </div>

            {/* Video Info */}
            {selectedVideo && (
              <div className="thumbnail-player-info">
                <h1 className="thumbnail-player-title">{selectedVideo.title}</h1>

                {/* Channel and Actions Row */}
                <div className="thumbnail-player-header-row">
                  <div className="thumbnail-player-channel">
                    <ProfileImage
                      src={null}
                      name={selectedVideo.channel_title}
                      size={48}
                      fallbackInitial="C"
                    />
                    <div className="thumbnail-player-channel-info">
                      <div className="thumbnail-player-channel-name">{selectedVideo.channel_title || 'Channel Name'}</div>
                      <div className="thumbnail-player-channel-subs">Placeholder subscribers</div>
                    </div>
                    <button className="thumbnail-player-action">Bell</button>
                    <button className="thumbnail-player-subscribe">Subscribe</button>
                  </div>

                  {/* Action Buttons */}
                  <div className="thumbnail-player-actions">
                    <button className="thumbnail-player-action">Like</button>
                    <button className="thumbnail-player-action">Dislike</button>
                    <button className="thumbnail-player-action">Share</button>
                    <button className="thumbnail-player-action">Save</button>
                    <button className="thumbnail-player-action">Clip</button>
                    <button className="thumbnail-player-action">More</button>
                  </div>
                </div>

                <div className="thumbnail-player-metadata">
                  <span>{(selectedVideo.views ?? 0).toLocaleString()} views</span>
                  <span>•</span>
                  <span>{formatDisplayDate(selectedVideo.published_at)}</span>
                </div>

                {/* Description */}
                <div className="thumbnail-player-description-section">
                  <div className={descriptionExpanded ? 'thumbnail-player-description expanded' : 'thumbnail-player-description'}>
                    {(selectedVideo.description || 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.').split('\n').map((line, idx) => (
                      <div key={idx}>{line}</div>
                    ))}
                  </div>
                  {!descriptionExpanded && (selectedVideo.description || '').length > 150 && (
                    <button
                      className="thumbnail-player-expand-button"
                      onClick={() => setDescriptionExpanded(true)}
                    >
                      ...more
                    </button>
                  )}
                  {descriptionExpanded && (
                    <button
                      className="thumbnail-player-expand-button"
                      onClick={() => setDescriptionExpanded(false)}
                    >
                      Show less
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Comments Section */}
            <div className="thumbnail-player-comments">
              <h3 className="thumbnail-player-comments-title">{SAMPLE_COMMENTS.length} Comments</h3>

              <div className="thumbnail-player-comment-input">
                <ProfileImage
                  src={null}
                  name="You"
                  size={36}
                  fallbackInitial="U"
                />
                <input type="text" placeholder="Add a comment..." />
              </div>

              <div className="thumbnail-player-comments-list">
                {SAMPLE_COMMENTS.map((comment, idx) => (
                  <div key={idx} className="thumbnail-player-comment">
                    <ProfileImage
                      src={null}
                      name={comment.author}
                      size={36}
                    />
                    <div className="thumbnail-player-comment-content">
                      <div className="thumbnail-player-comment-header">
                        <span className="thumbnail-player-comment-author">{comment.author}</span>
                        <span className="thumbnail-player-comment-time">{comment.timeAgo}</span>
                      </div>
                      <p className="thumbnail-player-comment-text">{comment.text}</p>
                      <div className="thumbnail-player-comment-actions">
                        <button>Like {comment.likes}</button>
                        <button>Dislike</button>
                        <button>Reply</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="thumbnail-player-sidebar">
            {sidebarItems.map((item, idx) => {
              if (item.type === 'video') {
                const video = item.data as CompetitorVideoRow
                return (
                  <div key={`video-${idx}`} className="thumbnail-player-sidebar-item">
                    <div className="thumbnail-player-sidebar-thumbnail">
                      {video.thumbnail_url ? (
                        <img src={video.thumbnail_url} alt={video.title} />
                      ) : (
                        <div className="thumbnail-player-sidebar-placeholder" />
                      )}
                      <span className="thumbnail-player-sidebar-duration">8:09</span>
                    </div>
                    <div className="thumbnail-player-sidebar-info">
                      <h4 className="thumbnail-player-sidebar-title">{video.title}</h4>
                      <p className="thumbnail-player-sidebar-channel">{video.channel_title}</p>
                      <p className="thumbnail-player-sidebar-stats">
                        {(video.views ?? 0).toLocaleString()} views • {formatDisplayDate(video.published_at)}
                      </p>
                    </div>
                  </div>
                )
              } else if (item.type === 'shorts-section') {
                const shortsData = item.data as CompetitorVideoRow[]
                return (
                  <div key="shorts-section" className="thumbnail-player-shorts-section">
                    <div className="thumbnail-player-shorts-grid">
                      {shortsData.map((short) => (
                        <div key={short.id} className="thumbnail-player-short">
                          <div className="thumbnail-player-short-image">
                            {short.thumbnail_url ? (
                              <img src={short.thumbnail_url} alt={short.title} />
                            ) : (
                              <div className="thumbnail-player-sidebar-placeholder" />
                            )}
                          </div>
                          <p className="thumbnail-player-short-title">{short.title}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }
              return null
            })}
          </div>
        </div>
          )}
        </PageCard>
      </div>
    </div>
  )
}

export default TestThumbnailVideoPlayerTab

import { useCallback, useEffect, useState } from 'react'
import { PageCard } from '../../components/cards'
import { ProfileImage } from '../../components/ui'
import { formatDisplayDate } from '../../utils/date'
import ThumbnailUploader from './ThumbnailUploader'
import type { ThumbnailTabProps, CompetitorVideoRow } from './types'
import { insertThumbnailsAtRandom } from './utils'
import './TestThumbnailVideoPlayerTab.css'

const SAMPLE_COMMENTS = [
  {
    author: 'User One',
    text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    likes: 1200,
    timeAgo: '1 day ago',
  },
  {
    author: 'User Two',
    text: 'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    likes: 850,
    timeAgo: '2 days ago',
  },
  {
    author: 'User Three',
    text: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
    likes: 450,
    timeAgo: '3 days ago',
  },
  {
    author: 'User Four',
    text: 'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.',
    likes: 620,
    timeAgo: '1 day ago',
  },
  {
    author: 'User Five',
    text: 'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia.',
    likes: 340,
    timeAgo: '4 hours ago',
  },
  {
    author: 'User Six',
    text: 'Nulla facilisi. Cras non velit nec insit tempor feugiat non magnis.',
    likes: 890,
    timeAgo: '2 hours ago',
  },
  {
    author: 'User Seven',
    text: 'Pellentesque habitant morbi tristique senectus et netus et malesuada fames.',
    likes: 540,
    timeAgo: '6 hours ago',
  },
  {
    author: 'User Eight',
    text: 'Vestibulum tortor quam, feugiat vitae, ultricies eget, consequat quis.',
    likes: 720,
    timeAgo: '12 hours ago',
  },
  {
    author: 'User Nine',
    text: 'Integer posuere erat a ante venenatis dapibus posuere velit aliquet.',
    likes: 415,
    timeAgo: '18 hours ago',
  },
  {
    author: 'User Ten',
    text: 'Aenean lacinia bibendum nulla sed consectetur. Praesent commodo cursus magna.',
    likes: 980,
    timeAgo: '1 day ago',
  },
  {
    author: 'User Eleven',
    text: 'Vivamus suscipit tortor eget felis porttitor volutpat. Cras ultricies libero.',
    likes: 645,
    timeAgo: '1 day ago',
  },
  {
    author: 'User Twelve',
    text: 'Donec sollicitudin molestie malesuada. Nulla porttitor accumsan tincidunt.',
    likes: 555,
    timeAgo: '2 days ago',
  },
  {
    author: 'User Thirteen',
    text: 'Mauris blandit aliquet elit, eget tincidunt nibh pulvinar a. Sed porttitor.',
    likes: 480,
    timeAgo: '2 days ago',
  },
]

function TestThumbnailVideoPlayerTab({ thumbnailTitle, setThumbnailTitle, thumbnails, setThumbnails }: ThumbnailTabProps) {
  const [videos, setVideos] = useState<CompetitorVideoRow[]>([])
  const [shorts, setShorts] = useState<CompetitorVideoRow[]>([])
  const [selectedVideo, setSelectedVideo] = useState<CompetitorVideoRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)

  const fetchVideos = useCallback(async (title: string = '') => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ title, limit: '100' })
      const response = await fetch(`http://localhost:8000/competitors/related-videos?${params.toString()}`)
      const data = await response.json()
      const allVideos = Array.isArray(data.items) ? data.items : []

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

      const regularVideos = insertThumbnailsAtRandom(
        allVideos.filter((v: CompetitorVideoRow) => v.content_type !== 'short').slice(0, 20),
        thumbnails,
        thumbnailTitle,
      )
      const shortVideos = allVideos.filter((v: CompetitorVideoRow) => v.content_type === 'short').slice(0, 3)

      setVideos(regularVideos)
      setShorts(shortVideos)
    } catch (error) {
      console.error('Failed to load videos', error)
    } finally {
      setLoading(false)
    }
  }, [thumbnails, thumbnailTitle, selectedVideo])

  useEffect(() => {
    // Load initial videos on mount
    fetchVideos('')
  }, [fetchVideos])

  const handleGetVideos = () => {
    fetchVideos('')
  }

  // Build sidebar with videos and shorts
  const buildSidebar = () => {
    const sidebar: { type: string; data: CompetitorVideoRow | CompetitorVideoRow[] }[] = []
    const allItems = [...videos]

    // Add first 4 videos
    allItems.slice(0, 4).forEach((video) => {
      sidebar.push({ type: 'video', data: video })
    })

    // Add shorts section after first 4 videos
    if (shorts.length > 0) {
      sidebar.push({ type: 'shorts-section', data: shorts })
    }

    // Add remaining videos
    allItems.slice(4).forEach((video) => {
      sidebar.push({ type: 'video', data: video })
    })

    return sidebar
  }

  const sidebarItems = buildSidebar()

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
      {loading && (
        <div className="page-row">
          <PageCard>
            <div className="thumbnail-loading">Loading...</div>
          </PageCard>
        </div>
      )}
      <div className="page-row">
        <PageCard>
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
                      className="thumbnail-player-channel-avatar"
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
                  <span>{(selectedVideo.view_count ?? 0).toLocaleString()} views</span>
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
                  className="thumbnail-player-comment-avatar"
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
                      className="thumbnail-player-comment-avatar"
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
                        {(video.view_count ?? 0).toLocaleString()} views • {formatDisplayDate(video.published_at)}
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
        </PageCard>
      </div>
    </div>
  )
}

export default TestThumbnailVideoPlayerTab

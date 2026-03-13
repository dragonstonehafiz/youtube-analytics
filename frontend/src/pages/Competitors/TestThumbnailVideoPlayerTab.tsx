import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageCard } from '../../components/cards'
import { ProfileImage } from '../../components/ui'
import { formatDisplayDate } from '../../utils/date'
import ThumbnailUploader from './ThumbnailUploader'
import UserVideoSelector from './UserVideoSelector'
import type { ThumbnailTabProps, CompetitorVideoRow } from './types'
import useUserVideoState from './useUserVideoState'
import { insertThumbnailsAtRandom, shuffleArray } from './utils'
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

function TestThumbnailVideoPlayerTab({ thumbnailTitle, setThumbnailTitle, thumbnails, setThumbnails }: ThumbnailTabProps) {
  const [videos, setVideos] = useState<CompetitorVideoRow[]>([])
  const [shorts, setShorts] = useState<CompetitorVideoRow[]>([])
  const [selectedVideo, setSelectedVideo] = useState<CompetitorVideoRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)

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

  const handleGetVideos = useCallback(() => {
    fetchVideos('')
  }, [fetchVideos])

  // Combine videos with user selected videos
  const { allVideosCombined, allShortsCombined } = useMemo(() => ({
    allVideosCombined: shuffleArray([...videos, ...userVideos]),
    allShortsCombined: shuffleArray([...shorts, ...userVideos.filter((v) => v.content_type === 'short')]),
  }), [videos, shorts, userVideos])

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
        </PageCard>
      </div>
    </div>
  )
}

export default TestThumbnailVideoPlayerTab

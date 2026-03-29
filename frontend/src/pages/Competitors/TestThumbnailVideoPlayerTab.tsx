import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageCard } from '@components/ui'
import { ProfileImage } from '@components/ui'
import { formatDisplayDate } from '@utils/date'
import { formatWholeNumber } from '@utils/number'
import { getStored } from '@utils/storage'
import ThumbnailUploader from './ThumbnailUploader'
import type { CompetitorVideoRow } from '@types'
import { fetchCompetitorVideoBuckets, insertThumbnailsAtRandom, shuffleArray } from './utils'
import './TestThumbnailVideoPlayerTab.css'

type ChannelInfo = {
  title: string
  subscriberCount: string
  thumbnailUrl: string | null
}

type Comment = {
  author_name: string
  text_display: string
  like_count: number
  published_at: string
  author_profile_image_url: string | null
}

function TestThumbnailVideoPlayerTab() {
  const [videos, setVideos] = useState<CompetitorVideoRow[]>([])
  const [shorts, setShorts] = useState<CompetitorVideoRow[]>([])
  const [selectedVideo, setSelectedVideo] = useState<CompetitorVideoRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [channelInfo, setChannelInfo] = useState<ChannelInfo | null>(null)
  const [comments, setComments] = useState<Comment[]>([])

  const fetchVideos = useCallback(async (title: string = '') => {
    try {
      setLoading(true)
      const includeShorts = getStored<boolean>('includeShorts', false)
      const numVideosToInclude = getStored('numVideosToInclude', '')
      const numShortsToInclude = getStored('numShortsToInclude', '')
      const { videos: allVideos, shorts: shortVideos } = await fetchCompetitorVideoBuckets(title, includeShorts, numVideosToInclude || 100, numShortsToInclude || 3)

      // First, get user's most viewed video if not already loaded
      let videoId: string | null = null
      if (!selectedVideo) {
        try {
          const myVideoResponse = await fetch('http://localhost:8000/videos?limit=1&sort=views&direction=desc')
          const myVideoData = await myVideoResponse.json()
          if (Array.isArray(myVideoData.items) && myVideoData.items.length > 0) {
            setSelectedVideo(myVideoData.items[0] as CompetitorVideoRow)
            videoId = myVideoData.items[0].id
          }
        } catch (error) {
          console.error('Failed to load top video', error)
        }
      } else {
        videoId = selectedVideo.id
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

      // Fetch channel info
      try {
        const meResponse = await fetch('http://localhost:8000/me')
        const meData = await meResponse.json()
        setChannelInfo({
          title: meData.title,
          subscriberCount: `${formatWholeNumber(meData.subscriber_count)} subscribers`,
          thumbnailUrl: meData.thumbnail_url,
        })
      } catch (error) {
        console.error('Failed to load channel info', error)
      }

      // Fetch comments for the selected video
      if (videoId) {
        try {
          const commentsResponse = await fetch(`http://localhost:8000/comments?video_id=${videoId}&limit=20&sort_by=likes&direction=desc`)
          const commentsData = await commentsResponse.json()
          setComments(commentsData.items || [])
        } catch (error) {
          console.error('Failed to load comments', error)
        }
      }
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
                      src={channelInfo?.thumbnailUrl ?? null}
                      name={channelInfo?.title}
                      size={48}
                      fallbackInitial="C"
                    />
                    <div className="thumbnail-player-channel-info">
                      <div className="thumbnail-player-channel-name">{channelInfo?.title || 'Channel Name'}</div>
                      <div className="thumbnail-player-channel-subs">{channelInfo?.subscriberCount || 'Loading...'}</div>
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
              <h3 className="thumbnail-player-comments-title">{comments.length} Comments</h3>

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
                {comments.map((comment, idx) => (
                  <div key={idx} className="thumbnail-player-comment">
                    <ProfileImage
                      src={comment.author_profile_image_url ?? null}
                      name={comment.author_name}
                      size={36}
                    />
                    <div className="thumbnail-player-comment-content">
                      <div className="thumbnail-player-comment-header">
                        <span className="thumbnail-player-comment-author">{comment.author_name}</span>
                        <span className="thumbnail-player-comment-time">{formatDisplayDate(comment.published_at)}</span>
                      </div>
                      <p className="thumbnail-player-comment-text">{comment.text_display}</p>
                      <div className="thumbnail-player-comment-actions">
                        <button>Like {formatWholeNumber(comment.like_count)}</button>
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
                      <div className="thumbnail-channel-info">
                        {video.channel_avatar_url !== undefined && (
                          <ProfileImage src={video.channel_avatar_url ?? null} name={video.channel_title} size={20} />
                        )}
                        <p className="thumbnail-player-sidebar-channel">{video.channel_title}</p>
                      </div>
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

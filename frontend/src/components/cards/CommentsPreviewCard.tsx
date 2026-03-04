import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActionButton, ProfileImage } from '../ui'
import { useHideVideoThumbnails, useHideDescription } from '../../hooks/usePrivacyMode'
import './CommentsPreviewCard.css'

type CommentPreview = {
  id: string
  author_name: string | null
  author_channel_id: string | null
  author_profile_image_url: string | null
  published_at: string | null
  text_display: string | null
  video_thumbnail_url: string | null
}

function formatRelativeTime(value: string | null): string {
  if (!value) {
    return '-'
  }
  const now = Date.now()
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) {
    return '-'
  }
  const diffMs = Math.max(0, now - then)
  const hours = Math.floor(diffMs / 3600000)
  if (hours < 1) {
    return 'just now'
  }
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function toHandle(value: string | null): string {
  if (!value || !value.trim()) {
    return '@Unknown'
  }
  const trimmed = value.trim()
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`
}

function CommentsPreviewCard() {
  const navigate = useNavigate()
  const hideVideoThumbnails = useHideVideoThumbnails()
  const hideDescription = useHideDescription()
  const [items, setItems] = useState<CommentPreview[]>([])

  const handleOpenAudience = (channelId: string | null) => {
    if (!channelId) {
      return
    }
    navigate(`/audience/${channelId}`)
  }

  useEffect(() => {
    async function loadCommentsPreview() {
      try {
        const response = await fetch('http://localhost:8000/comments?limit=3&sort_by=published_at&direction=desc')
        const data = await response.json()
        const mapped = (Array.isArray(data?.items) ? data.items : []).map((item: any) => ({
          id: String(item.id ?? ''),
          author_name: item.author_name ?? null,
          author_channel_id: item.author_channel_id ?? null,
          author_profile_image_url: item.author_profile_image_url ?? null,
          published_at: item.published_at ?? null,
          text_display: item.text_display ?? null,
          video_thumbnail_url: item.video_thumbnail_url ?? null,
        }))
        setItems(mapped)
      } catch (error) {
        console.error('Failed to load dashboard comments preview', error)
        setItems([])
      }
    }

    loadCommentsPreview()
  }, [])

  return (
    <section className="dashboard-comments-card">
      <h2 className="dashboard-comments-title">Comments</h2>
      {items.length === 0 ? (
        <div className="dashboard-comments-empty">No comments available</div>
      ) : (
        <div className="dashboard-comments-list">
          {items.map((item) => (
            <article key={item.id} className="dashboard-comment-item">
              <div className="dashboard-comment-main">
                <button
                  type="button"
                  className="dashboard-comment-avatar-button"
                  onClick={() => handleOpenAudience(item.author_channel_id)}
                  disabled={!item.author_channel_id}
                  aria-label="View audience member"
                >
                  <ProfileImage
                    className="dashboard-comment-avatar"
                    src={item.author_profile_image_url}
                    name={item.author_name}
                    fallbackInitial="U"
                    youtubeAvatarSize={88}
                  />
                </button>
                <div className="dashboard-comment-content">
                  <div className="dashboard-comment-meta">
                    {item.author_channel_id ? (
                      <button
                        type="button"
                        className="video-title-button"
                        onClick={() => handleOpenAudience(item.author_channel_id)}
                      >
                        {toHandle(item.author_name)}
                      </button>
                    ) : (
                      <span className="video-title">{toHandle(item.author_name)}</span>
                    )}
                    <span className="dashboard-comment-sep">-</span>
                    <span className="dashboard-comment-time">{formatRelativeTime(item.published_at)}</span>
                  </div>
                  <div className="dashboard-comment-text">{hideDescription ? '' : (item.text_display ?? '')}</div>
                </div>
              </div>
              {hideVideoThumbnails ? (
                <div className="dashboard-comment-video-thumb" />
              ) : item.video_thumbnail_url ? (
                <img className="dashboard-comment-video-thumb" src={item.video_thumbnail_url} alt="" />
              ) : (
                <div className="dashboard-comment-video-thumb" />
              )}
            </article>
          ))}
        </div>
      )}
      <ActionButton label="View more" variant="soft" onClick={() => navigate('/comments')} />
    </section>
  )
}

export default CommentsPreviewCard


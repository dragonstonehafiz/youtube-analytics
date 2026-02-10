import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActionButton } from '../ui'
import './CommentsPreviewCard.css'

type CommentPreview = {
  id: string
  author_name: string | null
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

function avatarInitial(value: string | null): string {
  if (!value || !value.trim()) {
    return 'U'
  }
  return value.trim().charAt(0).toUpperCase()
}

function upscaleYouTubeAvatar(url: string, size = 88): string {
  return url.replace(/\/s\d+(-[a-z0-9-]+)?\/photo\.jpg$/i, `/s${size}/photo.jpg`)
}

function CommentsPreviewCard() {
  const navigate = useNavigate()
  const [items, setItems] = useState<CommentPreview[]>([])

  useEffect(() => {
    async function loadCommentsPreview() {
      try {
        const response = await fetch('http://127.0.0.1:8000/comments?limit=3&sort_by=published_at&direction=desc')
        const data = await response.json()
        const mapped = (Array.isArray(data?.items) ? data.items : []).map((item: any) => ({
          id: String(item.id ?? ''),
          author_name: item.author_name ?? null,
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
                {item.author_profile_image_url ? (
                  <img className="dashboard-comment-avatar" src={upscaleYouTubeAvatar(item.author_profile_image_url)} alt={item.author_name ?? 'Profile'} />
                ) : (
                  <div className="dashboard-comment-avatar">{avatarInitial(item.author_name)}</div>
                )}
                <div className="dashboard-comment-content">
                  <div className="dashboard-comment-meta">
                    <span className="dashboard-comment-handle">{toHandle(item.author_name)}</span>
                    <span className="dashboard-comment-dot">•</span>
                    <span className="dashboard-comment-time">{formatRelativeTime(item.published_at)}</span>
                  </div>
                  <div className="dashboard-comment-text">{item.text_display ?? ''}</div>
                </div>
              </div>
              {item.video_thumbnail_url ? (
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

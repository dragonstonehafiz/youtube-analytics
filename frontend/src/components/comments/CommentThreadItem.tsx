import { ActionButton } from '../ui'
import { formatDisplayDate } from '../../utils/date'
import './CommentThreadItem.css'

export type CommentRow = {
  id: string
  video_id?: string | null
  author_name: string | null
  author_profile_image_url: string | null
  reply_count?: number | null
  text_display: string | null
  like_count: number | null
  published_at: string | null
}

export type CommentThread = {
  parent: CommentRow
  replies: CommentRow[]
  repliesTotal: number
}

function getAuthorHandle(value: string | null): string {
  if (!value || !value.trim()) {
    return '@unknown'
  }
  const trimmed = value.trim()
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`
}

function getAvatarInitial(value: string | null): string {
  if (!value || !value.trim()) {
    return '?'
  }
  return value.trim().charAt(0).toUpperCase()
}

function upscaleYouTubeAvatar(url: string, size = 88): string {
  return url.replace(/\/s\d+(-[a-z0-9-]+)?\/photo\.jpg$/i, `/s${size}/photo.jpg`)
}

function formatPostedAt(value: string | null): string {
  return formatDisplayDate(value)
}

function formatLikeCount(value: number | null): string {
  return (value ?? 0).toLocaleString()
}

type Props = {
  thread: CommentThread
  videoId?: string
}

function buildYouTubeCommentUrl(videoId: string, commentId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&lc=${encodeURIComponent(commentId)}`
}

function CommentThreadItem({ thread, videoId }: Props) {
  const resolvedVideoId = videoId || (thread.parent.video_id ?? '')
  const commentUrl = resolvedVideoId && thread.parent.id ? buildYouTubeCommentUrl(resolvedVideoId, thread.parent.id) : ''
  return (
    <article className="comment-thread-item">
      <div className="comment-thread-row">
        {thread.parent.author_profile_image_url ? (
          <img
            className="comment-thread-avatar"
            src={upscaleYouTubeAvatar(thread.parent.author_profile_image_url)}
            alt={thread.parent.author_name || 'Profile'}
          />
        ) : (
          <div className="comment-thread-avatar">{getAvatarInitial(thread.parent.author_name)}</div>
        )}
        <div className="comment-thread-main">
          <header className="comment-thread-header">
            <div className="comment-thread-author">{getAuthorHandle(thread.parent.author_name)}</div>
            <div className="comment-thread-date">{formatPostedAt(thread.parent.published_at)}</div>
          </header>
          <div className="comment-thread-text">{thread.parent.text_display || ''}</div>
          <div className="comment-thread-meta">
            <span className="comment-thread-likes">{formatLikeCount(thread.parent.like_count)} likes</span>
            <span className="comment-thread-replies-count">Replies: {thread.repliesTotal.toLocaleString()}</span>
          </div>
        </div>
      </div>
      <div className="comment-thread-actions">
        {commentUrl ? (
          <ActionButton
            label="Open in YouTube"
            onClick={() => window.open(commentUrl, '_blank', 'noopener,noreferrer')}
            variant="soft"
            className="comment-thread-action-button"
          />
        ) : null}
      </div>
    </article>
  )
}

export default CommentThreadItem

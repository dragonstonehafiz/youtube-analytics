import { Link } from 'react-router-dom'
import { ActionButton, ProfileImage } from '../ui'
import { formatDisplayDate } from '../../utils/date'
import './CommentThreadItem.css'

export type CommentRow = {
  id: string
  video_id?: string | null
  author_name: string | null
  author_channel_id?: string | null
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
        <ProfileImage
          className="comment-thread-avatar"
          src={thread.parent.author_profile_image_url}
          name={thread.parent.author_name}
          youtubeAvatarSize={88}
        />
        <div className="comment-thread-main">
          <header className="comment-thread-header">
            {thread.parent.author_channel_id ? (
              <Link
                to={`/audience/${encodeURIComponent(thread.parent.author_channel_id)}`}
                className="comment-thread-author comment-thread-author-link"
              >
                {getAuthorHandle(thread.parent.author_name)}
              </Link>
            ) : (
              <div className="comment-thread-author">{getAuthorHandle(thread.parent.author_name)}</div>
            )}
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

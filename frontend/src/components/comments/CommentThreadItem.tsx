import { ActionButton } from '../ui'
import './CommentThreadItem.css'

export type CommentRow = {
  id: string
  parent_id: string | null
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
  if (!value) {
    return '-'
  }
  return new Date(value).toLocaleString()
}

function formatLikeCount(value: number | null): string {
  return (value ?? 0).toLocaleString()
}

type Props = {
  thread: CommentThread
  loadingReplies?: boolean
  repliesError?: string | null
  onShowMoreReplies?: () => void
  onHideReplies?: () => void
}

function CommentThreadItem({ thread, loadingReplies = false, repliesError = null, onShowMoreReplies, onHideReplies }: Props) {
  const canShowMore = thread.replies.length < thread.repliesTotal
  const canHide = thread.replies.length > 0
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
      {thread.replies.map((reply) => (
        <article key={reply.id} className="comment-thread-reply">
          <div className="comment-thread-row">
            {reply.author_profile_image_url ? (
              <img
                className="comment-thread-avatar"
                src={upscaleYouTubeAvatar(reply.author_profile_image_url)}
                alt={reply.author_name || 'Profile'}
              />
            ) : (
              <div className="comment-thread-avatar">{getAvatarInitial(reply.author_name)}</div>
            )}
            <div className="comment-thread-main">
              <header className="comment-thread-header">
                <div className="comment-thread-author">{getAuthorHandle(reply.author_name)}</div>
                <div className="comment-thread-date">{formatPostedAt(reply.published_at)}</div>
              </header>
              <div className="comment-thread-text">{reply.text_display || ''}</div>
              <div className="comment-thread-meta">
                <span className="comment-thread-likes">{formatLikeCount(reply.like_count)} likes</span>
              </div>
            </div>
          </div>
        </article>
      ))}
      {repliesError ? <div className="comment-thread-replies-error">{repliesError}</div> : null}
      <div className="comment-thread-actions">
        {canShowMore ? (
          <ActionButton
            label={loadingReplies ? 'Loading...' : 'Show more'}
            onClick={onShowMoreReplies}
            disabled={loadingReplies}
            variant="soft"
            className="comment-thread-action-button"
          />
        ) : null}
        {canHide ? (
          <ActionButton
            label="Hide replies"
            onClick={onHideReplies}
            disabled={loadingReplies}
            variant="soft"
            className="comment-thread-action-button"
          />
        ) : null}
      </div>
    </article>
  )
}

export default CommentThreadItem

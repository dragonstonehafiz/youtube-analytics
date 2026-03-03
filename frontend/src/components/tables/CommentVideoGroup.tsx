import { Link } from 'react-router-dom'
import { useHideVideoTitles, useHideVideoThumbnails } from '../../hooks/usePrivacyMode'
import CommentThreadItem, { type CommentThread } from './CommentThreadItem'

type CommentVideoGroupProps = {
  videoId: string
  videoTitle: string
  videoThumbnailUrl: string | null
  comments: CommentThread[]
}

function CommentVideoGroup({ videoId, videoTitle, videoThumbnailUrl, comments }: CommentVideoGroupProps) {
  const hideVideoTitles = useHideVideoTitles()
  const hideVideoThumbnails = useHideVideoThumbnails()

  return (
    <section className="comments-group">
      <header className="comments-group-header">
        <div className="comments-group-video">
          {hideVideoThumbnails ? (
            <div className="comments-group-thumb" />
          ) : videoThumbnailUrl ? (
            <img className="comments-group-thumb" src={videoThumbnailUrl} alt={videoTitle} />
          ) : (
            <div className="comments-group-thumb" />
          )}
          <Link to={`/videos/${videoId}`} className="comments-group-title">
            {hideVideoTitles ? '••••••' : videoTitle}
          </Link>
        </div>
        <span className="comments-group-count">{comments.length.toLocaleString()} threads</span>
      </header>
      <div className="comments-group-items">
        {comments.map((thread) => (
          <CommentThreadItem key={thread.parent.id} thread={thread} videoId={videoId} />
        ))}
      </div>
    </section>
  )
}

export type { CommentVideoGroupProps }
export default CommentVideoGroup

import { Link } from 'react-router-dom'
import CommentThreadItem, { type CommentThread } from './CommentThreadItem'

type CommentVideoGroupProps = {
  videoId: string
  videoTitle: string
  videoThumbnailUrl: string | null
  comments: CommentThread[]
}

function CommentVideoGroup({ videoId, videoTitle, videoThumbnailUrl, comments }: CommentVideoGroupProps) {
  return (
    <section className="comments-group">
      <header className="comments-group-header">
        <div className="comments-group-video">
          {videoThumbnailUrl ? (
            <img className="comments-group-thumb" src={videoThumbnailUrl} alt={videoTitle} />
          ) : (
            <div className="comments-group-thumb" />
          )}
          <Link to={`/videoDetails/${videoId}`} className="comments-group-title">
            {videoTitle}
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

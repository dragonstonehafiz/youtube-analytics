import { VideoThumbnail, TextLink } from '@components/ui'
import { useHideVideoTitles } from '@hooks/usePrivacyMode'
import CommentThreadItem, { type CommentThread } from './CommentThreadItem'

type CommentVideoGroupProps = {
  videoId: string
  videoTitle: string
  videoThumbnailUrl: string | null
  comments: CommentThread[]
}

function CommentVideoGroup({ videoId, videoTitle, videoThumbnailUrl, comments }: CommentVideoGroupProps) {
  const hideVideoTitles = useHideVideoTitles()
  return (
    <section className="comments-group">
      <header className="comments-group-header">
        <div className="comments-group-video">
          <VideoThumbnail url={videoThumbnailUrl} title={videoTitle} className="comments-group-thumb" />
          <TextLink text={videoTitle} to={`/videos/${videoId}`} hideText={hideVideoTitles} className="comments-group-title" />
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

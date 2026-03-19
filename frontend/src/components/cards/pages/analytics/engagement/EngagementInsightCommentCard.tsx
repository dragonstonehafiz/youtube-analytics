import { StatCard, VideoThumbnail, DisplayVideoTitle } from '../../../../ui'
import { formatWholeNumber } from '../../../../../utils/number'
import './EngagementInsightCommentCard.css'

type CommentVideoItem = {
  video_id: string
  title: string
  thumbnail_url: string
  published_at: string
  comment_count: number
}

type EngagementInsightCommentCardProps = {
  totalComments: number
  topCommentedVideos: CommentVideoItem[]
  loading: boolean
  onOpenVideo: (videoId: string) => void
}

function EngagementInsightCommentCard({
  totalComments,
  topCommentedVideos,
  loading,
  onOpenVideo,
}: EngagementInsightCommentCardProps) {
  return (
    <div className="engagement-insight-comment-card">
      <div className="engagement-insight-comment-stat">
        <StatCard label="Comments" value={formatWholeNumber(totalComments)} size="medium" />
      </div>
      {loading ? (
        <div className="engagement-insight-comment-state">Loading...</div>
      ) : topCommentedVideos.length === 0 ? (
        <div className="engagement-insight-comment-state">No comments in this period.</div>
      ) : (
        <div className="engagement-insight-comment-list">
          <div className="engagement-insight-comment-header" role="row">
            <span className="engagement-insight-comment-rank">#</span>
            <span className="engagement-insight-comment-video">Video</span>
            <span className="engagement-insight-comment-metric">Comments</span>
          </div>
          {topCommentedVideos.map((item, index) => (
            <div key={`${item.video_id}-${index}`} className="engagement-insight-comment-row">
              <span className="engagement-insight-comment-rank">{index + 1}</span>
              <VideoThumbnail url={item.thumbnail_url} title={item.title} className="engagement-insight-comment-thumb" />
              <button
                type="button"
                className="engagement-insight-comment-title"
                onClick={() => onOpenVideo(item.video_id)}
              >
                <DisplayVideoTitle title={item.title} />
              </button>
              <span className="engagement-insight-comment-metric">{formatWholeNumber(item.comment_count)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export type { CommentVideoItem }
export default EngagementInsightCommentCard

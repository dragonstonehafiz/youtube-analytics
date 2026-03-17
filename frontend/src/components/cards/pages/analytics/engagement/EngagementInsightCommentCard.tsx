import { StatCard } from '../../../../ui'
import { formatWholeNumber } from '../../../../../utils/number'
import { useHideVideoTitles, useHideVideoThumbnails } from '../../../../../hooks/usePrivacyMode'
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
  const hideVideoTitles = useHideVideoTitles()
  const hideVideoThumbnails = useHideVideoThumbnails()

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
              {hideVideoThumbnails ? (
                <div className="engagement-insight-comment-thumb" />
              ) : (
                <img className="engagement-insight-comment-thumb" src={item.thumbnail_url || ''} alt="" />
              )}
              <button
                type="button"
                className="engagement-insight-comment-title"
                onClick={() => onOpenVideo(item.video_id)}
              >
                {hideVideoTitles ? '••••••' : (item.title || '(untitled)')}
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

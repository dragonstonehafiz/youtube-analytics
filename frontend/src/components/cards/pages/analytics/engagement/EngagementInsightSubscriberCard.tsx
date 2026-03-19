import { StatCard, VideoThumbnail, DisplayVideoTitle } from '../../../../ui'
import { formatWholeNumber } from '../../../../../utils/number'
import './EngagementInsightSubscriberCard.css'

type SubscriberVideoItem = {
  video_id: string
  title: string
  thumbnail_url: string
  published_at: string
  subscribers_gained: number
}

type EngagementInsightSubscriberCardProps = {
  totalSubscribersGained: number
  topSubscriberVideos: SubscriberVideoItem[]
  loading: boolean
  onOpenVideo: (videoId: string) => void
}

function EngagementInsightSubscriberCard({
  totalSubscribersGained,
  topSubscriberVideos,
  loading,
  onOpenVideo,
}: EngagementInsightSubscriberCardProps) {
  return (
    <div className="engagement-insight-subscriber-card">
      <div className="engagement-insight-subscriber-stat">
        <StatCard label="Subscribers gained" value={formatWholeNumber(totalSubscribersGained)} size="medium" />
      </div>
      {loading ? (
        <div className="engagement-insight-subscriber-state">Loading...</div>
      ) : topSubscriberVideos.length === 0 ? (
        <div className="engagement-insight-subscriber-state">No growth in this period.</div>
      ) : (
        <div className="engagement-insight-subscriber-list">
          <div className="engagement-insight-subscriber-header" role="row">
            <span className="engagement-insight-subscriber-rank">#</span>
            <span className="engagement-insight-subscriber-video">Video</span>
            <span className="engagement-insight-subscriber-metric">Subscribers</span>
          </div>
          {topSubscriberVideos.map((item, index) => (
            <div key={`${item.video_id}-${index}`} className="engagement-insight-subscriber-row">
              <span className="engagement-insight-subscriber-rank">{index + 1}</span>
              <VideoThumbnail url={item.thumbnail_url} title={item.title} className="engagement-insight-subscriber-thumb" />
              <button
                type="button"
                className="engagement-insight-subscriber-title"
                onClick={() => onOpenVideo(item.video_id)}
              >
                <DisplayVideoTitle title={item.title} />
              </button>
              <span className="engagement-insight-subscriber-metric">{formatWholeNumber(item.subscribers_gained)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export type { SubscriberVideoItem }
export default EngagementInsightSubscriberCard

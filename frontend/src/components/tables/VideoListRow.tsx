import { ActionButton, VideoThumbnail, DisplayVideoTitle, DisplayDate } from '@components/ui'
import { useHideDescription } from '@hooks/usePrivacyMode'

export type VideoRow = {
  id: string
  title: string
  description: string | null
  published_at: string | null
  views: number | null
  like_count: number | null
  comment_count: number | null
  privacy_status: string | null
  duration_seconds: number | null
  thumbnail_url: string | null
}

type VideoListRowProps = {
  video: VideoRow
}

function VideoListRow({ video }: VideoListRowProps) {
  const hideDescription = useHideDescription()

  return (
    <div className="video-table-row">
      <div className="video-cell">
        <VideoThumbnail url={video.thumbnail_url} title={video.title} className="video-thumb" />
        <div className="video-meta">
          <DisplayVideoTitle title={video.title} videoId={video.id} className="video-title-button" />
          <div className="video-detail-sub">
            <div className="video-desc">{hideDescription ? '-' : (video.description ? video.description : '-')}</div>
            <div className="video-actions">
              <ActionButton
                label="Open in YouTube"
                onClick={() => window.open(`https://www.youtube.com/watch?v=${video.id}`, '_blank')}
                variant="soft"
                className="video-action"
              />
            </div>
          </div>
        </div>
      </div>
      <span className="video-muted">{video.privacy_status ?? '-'}</span>
      <span><DisplayDate date={video.published_at} /></span>
      <span className="right">{(video.views ?? 0).toLocaleString()}</span>
      <span className="right">{(video.comment_count ?? 0).toLocaleString()}</span>
      <span className="right">{(video.like_count ?? 0).toLocaleString()}</span>
    </div>
  )
}

export default VideoListRow

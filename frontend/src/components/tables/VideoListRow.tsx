import { useNavigate } from 'react-router-dom'
import { ActionButton } from '../ui'
import { formatDisplayDate } from '../../utils/date'
import { useHideVideoTitles, useHideVideoThumbnails, useHideDescription } from '../../hooks/usePrivacyMode'

export type VideoRow = {
  id: string
  title: string
  description: string | null
  published_at: string | null
  view_count: number | null
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
  const navigate = useNavigate()
  const hideVideoTitles = useHideVideoTitles()
  const hideVideoThumbnails = useHideVideoThumbnails()
  const hideDescription = useHideDescription()

  return (
    <div className="video-table-row">
      <div className="video-cell">
        {hideVideoThumbnails ? (
          <div className="video-thumb" />
        ) : video.thumbnail_url ? (
          <img className="video-thumb" src={video.thumbnail_url} alt={video.title} />
        ) : (
          <div className="video-thumb" />
        )}
        <div className="video-meta">
          <button
            type="button"
            className="video-title-button"
            onClick={() => navigate(`/videos/${video.id}`)}
          >
            {hideVideoTitles ? '••••••' : video.title}
          </button>
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
      <span>{formatDisplayDate(video.published_at)}</span>
      <span className="right">{(video.view_count ?? 0).toLocaleString()}</span>
      <span className="right">{(video.comment_count ?? 0).toLocaleString()}</span>
      <span className="right">{(video.like_count ?? 0).toLocaleString()}</span>
    </div>
  )
}

export default VideoListRow

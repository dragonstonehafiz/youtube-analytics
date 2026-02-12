import { useNavigate } from 'react-router-dom'
import { ActionButton } from '../ui'
import { formatDisplayDate } from '../../utils/date'

export type PlaylistItemRowData = {
  id: string
  playlist_id: string
  video_id: string | null
  position: number | null
  title: string | null
  description: string | null
  published_at: string | null
  video_published_at: string | null
  channel_id: string | null
  channel_title: string | null
  privacy_status: string | null
  thumbnail_url: string | null
  video_title: string | null
  video_description: string | null
  video_thumbnail_url: string | null
  video_privacy_status: string | null
  video_view_count: number | null
  video_comment_count: number | null
  video_like_count: number | null
}

type PlaylistItemRowProps = {
  item: PlaylistItemRowData
}

function PlaylistItemRow({ item }: PlaylistItemRowProps) {
  const navigate = useNavigate()
  const title = item.video_title || item.title || '(untitled)'
  const description = item.video_description || item.description || '-'
  const thumb = item.video_thumbnail_url || item.thumbnail_url
  const hasVideo = Boolean(item.video_id)

  return (
    <div className="playlist-items-row">
      <span className="right">{item.position ?? '-'}</span>
      <div className="video-cell">
        {thumb ? (
          <img className="video-thumb" src={thumb} alt={title} />
        ) : (
          <div className="video-thumb" />
        )}
        <div className="video-meta">
          {hasVideo ? (
            <button
              type="button"
              className="video-title-button"
              onClick={() => navigate(`/videos/${item.video_id}`)}
            >
              {title}
            </button>
          ) : (
            <div className="video-title">{title}</div>
          )}
          {hasVideo ? (
            <div className="video-detail-sub">
              <div className="video-desc">{description}</div>
              <div className="video-actions">
                <ActionButton
                  label="Open in YouTube"
                  onClick={() => window.open(`https://www.youtube.com/watch?v=${item.video_id}`, '_blank')}
                  variant="soft"
                  className="video-action"
                />
              </div>
            </div>
          ) : (
            <div className="video-muted">Video unavailable</div>
          )}
        </div>
      </div>
      <span>{formatDisplayDate(item.published_at)}</span>
      <span className="video-muted">{item.video_privacy_status || item.privacy_status || '-'}</span>
      <span className="right">{(item.video_view_count ?? 0).toLocaleString()}</span>
      <span className="right">{(item.video_comment_count ?? 0).toLocaleString()}</span>
      <span className="right">{(item.video_like_count ?? 0).toLocaleString()}</span>
    </div>
  )
}

export default PlaylistItemRow

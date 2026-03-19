import { ActionButton, VideoThumbnail, TextLink, DisplayDate } from '@components/ui'
import { useHideDescription, useHideVideoTitles } from '@hooks/usePrivacyMode'

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
  views: number | null
  video_comment_count: number | null
  video_like_count: number | null
  video_recent_views: number | null
  video_watch_time_minutes: number | null
  video_average_view_duration_seconds: number | null
}

type PlaylistItemRowProps = {
  item: PlaylistItemRowData
}

function PlaylistItemRow({ item }: PlaylistItemRowProps) {
  const hideDescription = useHideDescription()
  const hideVideoTitles = useHideVideoTitles()
  const title = item.video_title || item.title || '(untitled)'
  const description = hideDescription ? '-' : (item.video_description || item.description || '-')
  const thumb = item.video_thumbnail_url || item.thumbnail_url
  const hasVideo = Boolean(item.video_id)

  return (
    <div className="playlist-items-row">
      <span className="right">{item.position ?? '-'}</span>
      <div className="video-cell">
        <VideoThumbnail url={thumb} title={title} className="video-thumb" />
        <div className="video-meta">
          {hasVideo ? (
            <TextLink text={title} to={`/videos/${item.video_id}`} hideText={hideVideoTitles} className="video-title-button" />
          ) : (
            <TextLink text={title} hideText={hideVideoTitles} />
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
      <span><DisplayDate date={item.published_at} /></span>
      <span className="video-muted">{item.video_privacy_status || item.privacy_status || '-'}</span>
      <span className="right">{(item.views ?? 0).toLocaleString()}</span>
      <span className="right">{(item.video_comment_count ?? 0).toLocaleString()}</span>
      <span className="right">{(item.video_like_count ?? 0).toLocaleString()}</span>
    </div>
  )
}

export default PlaylistItemRow

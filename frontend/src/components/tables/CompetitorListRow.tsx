import { formatDisplayDate } from '../../utils/date'

export type CompetitorVideoRow = {
  id: string
  title: string
  description: string | null
  published_at: string | null
  channel_id: string | null
  channel_title: string | null
  views: number | null
  like_count: number | null
  comment_count: number | null
  thumbnail_url: string | null
  content_type?: string | null
}

type CompetitorListRowProps = {
  video: CompetitorVideoRow
}

function CompetitorListRow({ video }: CompetitorListRowProps) {
  return (
    <div className="video-table-row">
      <div className="video-cell">
        {video.thumbnail_url ? (
          <img className="video-thumb" src={video.thumbnail_url} alt={video.title} />
        ) : (
          <div className="video-thumb" />
        )}
        <div className="video-meta">
          <button
            type="button"
            className="video-title-button"
            onClick={() => window.open(`https://www.youtube.com/watch?v=${video.id}`, '_blank')}
          >
            {video.title}
          </button>
          <div className="video-detail-sub">
            <div style={{
              position: 'absolute',
              inset: 0,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: '1.3',
              maxHeight: '2.6em',
              fontSize: '11px',
              color: 'var(--color-muted)',
            }}>
              {video.description ?? '-'}
            </div>
          </div>
        </div>
      </div>
      <span className="video-muted">{video.channel_title ?? '-'}</span>
      <span>{formatDisplayDate(video.published_at)}</span>
      <span className="right">{(video.views ?? 0).toLocaleString()}</span>
      <span className="right">{(video.comment_count ?? 0).toLocaleString()}</span>
      <span className="right">{(video.like_count ?? 0).toLocaleString()}</span>
    </div>
  )
}

export default CompetitorListRow

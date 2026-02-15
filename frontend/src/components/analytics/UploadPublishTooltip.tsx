import { Link } from 'react-router-dom'

type PublishedItem = { video_id?: string; title: string; published_at: string; thumbnail_url: string; content_type: string }

export type UploadHoverState = {
  x: number
  y: number
  items: PublishedItem[]
  key: string
  startDate: string
  endDate: string
  dayCount: number
}

type UploadPublishTooltipProps = {
  hover: UploadHoverState | null
  onMouseEnter: () => void
  onMouseLeave: () => void
}

function UploadPublishTooltip({ hover, onMouseEnter, onMouseLeave }: UploadPublishTooltipProps) {
  if (!hover) {
    return null
  }
  return (
    <div
      className="chart-tooltip publish-tooltip"
      style={{ left: hover.x, top: hover.y + 18 }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="tooltip-date">{hover.startDate} to {hover.endDate}</div>
      <div className="tooltip-date">
        {hover.dayCount} {hover.dayCount === 1 ? 'day' : 'days'}
      </div>
      <div className="tooltip-date">
        {hover.items.length} {hover.items.length === 1 ? 'video' : 'videos'} published
      </div>
      <ul>
        {hover.items.map((item, index) => (
          <li key={`${item.title}-${index}`} className="publish-item">
            {item.thumbnail_url ? (
              <img className="publish-thumb" src={item.thumbnail_url} alt={item.title} />
            ) : (
              <div className="publish-thumb" />
            )}
            <div>
              {item.video_id ? (
                <Link className="publish-title publish-title-link" to={`/videos/${item.video_id}`}>
                  {item.title}
                </Link>
              ) : (
                <div className="publish-title">{item.title}</div>
              )}
              <div className="publish-date">{item.published_at?.split('T')[0] || ''}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default UploadPublishTooltip

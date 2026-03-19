import './TopContentTable.css'
import { VideoThumbnail, DisplayVideoTitle } from '../ui'

export type TopContentItem = {
  video_id: string
  rank: number
  title: string
  published_at: string
  upload_date: string
  thumbnail_url: string
  avg_view_duration: string
  avg_view_pct: string
  views: string
}

type TopContentTableProps = {
  items: TopContentItem[]
}

function TopContentTable({ items }: TopContentTableProps) {
  return (
    <div className="top-content">
      <div className="top-content-title">Your top content in this period</div>
      <div className="top-content-table">
        <div className="top-content-header">
          <span>Content</span>
          <span className="right">Upload date</span>
          <span className="right">Average view duration</span>
          <span className="right">Views</span>
        </div>
        {items.map((item) => (
          <div key={item.rank} className="top-content-row">
            <div className="content-cell">
              <div className="rank">{item.rank}</div>
              <VideoThumbnail url={item.thumbnail_url} title={item.title} className="thumb" />
              <div className="meta">
                <DisplayVideoTitle title={item.title} videoId={item.video_id} className="title top-content-link" />
              </div>
            </div>
            <div className="right">{item.upload_date}</div>
            <div className="right">{item.avg_view_duration} ({item.avg_view_pct})</div>
            <div className="right">{item.views}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default TopContentTable

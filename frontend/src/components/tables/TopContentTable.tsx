import './TopContentTable.css'
import { VideoThumbnail, TextLink } from '@components/ui'
import { useHideVideoTitles } from '@hooks/usePrivacyMode'

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
  const hideVideoTitles = useHideVideoTitles()
  return (
    <div className="top-content">
      <div className="top-content-title">Your top content in this period</div>
      <table className="top-content-table">
        <thead>
          <tr>
            <th>Content</th>
            <th className="right">Upload date</th>
            <th className="right">Average view duration</th>
            <th className="right">Views</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.rank}>
              <td>
                <div className="content-cell">
                  <div className="rank">{item.rank}</div>
                  <VideoThumbnail url={item.thumbnail_url} title={item.title} className="thumb" />
                  <div className="meta">
                    <TextLink text={item.title} to={`/videos/${item.video_id}`} hideText={hideVideoTitles} className="title top-content-link" />
                  </div>
                </div>
              </td>
              <td className="right">{item.upload_date}</td>
              <td className="right">{item.avg_view_duration} ({item.avg_view_pct})</td>
              <td className="right">{item.views}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default TopContentTable

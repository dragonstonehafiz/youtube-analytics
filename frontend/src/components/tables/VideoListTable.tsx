import VideoListRow, { type VideoRow } from './VideoListRow'

export type VideoSortKey = 'date' | 'views' | 'comments' | 'likes'

type VideoListTableProps = {
  rows: VideoRow[]
  sortKey: VideoSortKey
  sortDir: 'asc' | 'desc'
  onToggleSort: (key: VideoSortKey) => void
}

function VideoListTable({ rows, sortKey, sortDir, onToggleSort }: VideoListTableProps) {
  const renderSortArrow = (key: VideoSortKey) => (
    sortKey === key ? <span className="sort-arrow">{sortDir === 'asc' ? '↑' : '↓'}</span> : null
  )

  if (rows.length === 0) {
    return <div className="video-table-empty">No videos found.</div>
  }

  return (
    <table className="video-data-table">
      <thead>
        <tr>
          <th scope="col">Video</th>
          <th scope="col">Visibility</th>
          <th scope="col">
            <button
              type="button"
              className={sortKey === 'date' ? 'table-sort-button active' : 'table-sort-button'}
              onClick={() => onToggleSort('date')}
            >
              Date
              {renderSortArrow('date')}
            </button>
          </th>
          <th scope="col">
            <button
              type="button"
              className={sortKey === 'views' ? 'table-sort-button active' : 'table-sort-button'}
              onClick={() => onToggleSort('views')}
            >
              Views
              {renderSortArrow('views')}
            </button>
          </th>
          <th scope="col">
            <button
              type="button"
              className={sortKey === 'comments' ? 'table-sort-button active' : 'table-sort-button'}
              onClick={() => onToggleSort('comments')}
            >
              Comments
              {renderSortArrow('comments')}
            </button>
          </th>
          <th scope="col">
            <button
              type="button"
              className={sortKey === 'likes' ? 'table-sort-button active' : 'table-sort-button'}
              onClick={() => onToggleSort('likes')}
            >
              Likes
              {renderSortArrow('likes')}
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((video) => <VideoListRow key={video.id} video={video} />)}
      </tbody>
    </table>
  )
}

export default VideoListTable

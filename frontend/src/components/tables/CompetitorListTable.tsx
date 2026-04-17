import CompetitorListRow, { type CompetitorVideoRow } from './CompetitorListRow'

export type CompetitorSortKey = 'date' | 'views' | 'comments' | 'likes'

type CompetitorListTableProps = {
  rows: CompetitorVideoRow[]
  sortKey: CompetitorSortKey
  sortDir: 'asc' | 'desc'
  onToggleSort: (key: CompetitorSortKey) => void
}

function CompetitorListTable({ rows, sortKey, sortDir, onToggleSort }: CompetitorListTableProps) {
  const renderSortArrow = (key: CompetitorSortKey) => (
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
          <th scope="col">Channel</th>
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
        {rows.map((video) => <CompetitorListRow key={video.id} video={video} />)}
      </tbody>
    </table>
  )
}

export default CompetitorListTable

import CompetitorListRow, { type CompetitorVideoRow } from './CompetitorListRow'

export type CompetitorSortKey = 'date' | 'views' | 'comments' | 'likes'

type CompetitorListTableProps = {
  rows: CompetitorVideoRow[]
  sortKey: CompetitorSortKey
  sortDir: 'asc' | 'desc'
  onToggleSort: (key: CompetitorSortKey) => void
}

function CompetitorListTable({ rows, sortKey, sortDir, onToggleSort }: CompetitorListTableProps) {
  return (
    <div className="video-table">
      <div className="video-table-header">
        <span>Video</span>
        <span>Channel</span>
        <button
          type="button"
          className={sortKey === 'date' ? 'video-sort-button active' : 'video-sort-button'}
          onClick={() => onToggleSort('date')}
        >
          Date
          {sortKey === 'date' ? <span className="video-sort">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
        </button>
        <button
          type="button"
          className={sortKey === 'views' ? 'video-sort-button active right' : 'video-sort-button right'}
          onClick={() => onToggleSort('views')}
        >
          Views
          {sortKey === 'views' ? <span className="video-sort">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
        </button>
        <button
          type="button"
          className={sortKey === 'comments' ? 'video-sort-button active right' : 'video-sort-button right'}
          onClick={() => onToggleSort('comments')}
        >
          Comments
          {sortKey === 'comments' ? <span className="video-sort">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
        </button>
        <button
          type="button"
          className={sortKey === 'likes' ? 'video-sort-button active right' : 'video-sort-button right'}
          onClick={() => onToggleSort('likes')}
        >
          Likes
          {sortKey === 'likes' ? <span className="video-sort">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="video-table-empty">No videos found.</div>
      ) : (
        rows.map((video) => <CompetitorListRow key={video.id} video={video} />)
      )}
    </div>
  )
}

export default CompetitorListTable

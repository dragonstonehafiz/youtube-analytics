import PlaylistItemRow, { type PlaylistItemRowData } from './PlaylistItemRow'

export type PlaylistItemSortKey = 'position' | 'published_at' | 'views'

type PlaylistItemsTableProps = {
  items: PlaylistItemRowData[]
  sortBy: PlaylistItemSortKey
  direction: 'asc' | 'desc'
  onToggleSort: (key: PlaylistItemSortKey) => void
}

function PlaylistItemsTable({ items, sortBy, direction, onToggleSort }: PlaylistItemsTableProps) {
  return (
    <div className="playlist-items-table">
      <div className="playlist-items-header">
        <button
          type="button"
          className={sortBy === 'position' ? 'video-sort-button active right' : 'video-sort-button right'}
          onClick={() => onToggleSort('position')}
        >
          Pos
          {sortBy === 'position' ? <span className="video-sort">{direction === 'asc' ? '↑' : '↓'}</span> : null}
        </button>
        <span>Video</span>
        <button
          type="button"
          className={sortBy === 'published_at' ? 'video-sort-button active' : 'video-sort-button'}
          onClick={() => onToggleSort('published_at')}
        >
          Added
          {sortBy === 'published_at' ? <span className="video-sort">{direction === 'asc' ? '↑' : '↓'}</span> : null}
        </button>
        <span>Visibility</span>
        <button
          type="button"
          className={sortBy === 'views' ? 'video-sort-button active right' : 'video-sort-button right'}
          onClick={() => onToggleSort('views')}
        >
          Views
          {sortBy === 'views' ? <span className="video-sort">{direction === 'asc' ? '↑' : '↓'}</span> : null}
        </button>
        <span className="right">Comments</span>
        <span className="right">Likes</span>
      </div>
      {items.length === 0 ? (
        <div className="video-detail-state">No playlist items found.</div>
      ) : (
        items.map((item) => <PlaylistItemRow key={item.id} item={item} />)
      )}
    </div>
  )
}

export default PlaylistItemsTable

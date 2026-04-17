import PlaylistItemRow, { type PlaylistItemRowData } from './PlaylistItemRow'

export type PlaylistItemSortKey = 'position' | 'published_at' | 'views' | 'comments' | 'likes'

type PlaylistItemsTableProps = {
  items: PlaylistItemRowData[]
  sortBy: PlaylistItemSortKey
  direction: 'asc' | 'desc'
  onToggleSort: (key: PlaylistItemSortKey) => void
}

function PlaylistItemsTable({ items, sortBy, direction, onToggleSort }: PlaylistItemsTableProps) {
  return (
    <>
      {items.length === 0 ? (
        <div className="video-detail-state">No playlist items found.</div>
      ) : (
        <table className="playlist-items-table">
          <thead>
            <tr>
              <th>
                <button
                  type="button"
                  className={sortBy === 'position' ? 'table-sort-button active' : 'table-sort-button'}
                  onClick={() => onToggleSort('position')}
                >
                  Pos
                  {sortBy === 'position' ? <span className="sort-arrow">{direction === 'asc' ? '↑' : '↓'}</span> : null}
                </button>
              </th>
              <th>Video</th>
              <th>
                <button
                  type="button"
                  className={sortBy === 'published_at' ? 'table-sort-button active' : 'table-sort-button'}
                  onClick={() => onToggleSort('published_at')}
                >
                  Added
                  {sortBy === 'published_at' ? <span className="sort-arrow">{direction === 'asc' ? '↑' : '↓'}</span> : null}
                </button>
              </th>
              <th>Visibility</th>
              <th>
                <button
                  type="button"
                  className={sortBy === 'views' ? 'table-sort-button active' : 'table-sort-button'}
                  onClick={() => onToggleSort('views')}
                >
                  Views
                  {sortBy === 'views' ? <span className="sort-arrow">{direction === 'asc' ? '↑' : '↓'}</span> : null}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className={sortBy === 'comments' ? 'table-sort-button active' : 'table-sort-button'}
                  onClick={() => onToggleSort('comments')}
                >
                  Comments
                  {sortBy === 'comments' ? <span className="sort-arrow">{direction === 'asc' ? '↑' : '↓'}</span> : null}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className={sortBy === 'likes' ? 'table-sort-button active' : 'table-sort-button'}
                  onClick={() => onToggleSort('likes')}
                >
                  Likes
                  {sortBy === 'likes' ? <span className="sort-arrow">{direction === 'asc' ? '↑' : '↓'}</span> : null}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => <PlaylistItemRow key={item.id} item={item} />)}
          </tbody>
        </table>
      )}
    </>
  )
}

export default PlaylistItemsTable

import { PageCard } from '@components/cards'
import { PlaylistItemsTable } from '@components/tables'
import { PageSizePicker, PageSwitcher } from '@components/ui'
import { usePlaylistItems } from './usePlaylistItems'

type Props = {
  playlistId: string | undefined
}

export default function PlaylistItemsSection({ playlistId }: Props) {
  const { items, loadingItems, errorItems, sortBy, direction, page, setPage, pageSize, setPageSize, totalPages, toggleSort } = usePlaylistItems(playlistId)
  return (
    <PageCard>
      {loadingItems ? (
        <div className="video-detail-state">Loading playlist items...</div>
      ) : errorItems ? (
        <div className="video-detail-state">{errorItems}</div>
      ) : (
        <PlaylistItemsTable items={items} sortBy={sortBy} direction={direction} onToggleSort={toggleSort} />
      )}
      <div className="pagination-footer">
        <div className="pagination-main">
          <PageSwitcher currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
        <div className="pagination-size">
          <PageSizePicker value={pageSize} onChange={setPageSize} />
        </div>
      </div>
    </PageCard>
  )
}

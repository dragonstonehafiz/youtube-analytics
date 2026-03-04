import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActionButton, Dropdown, PageSizePicker, PageSwitcher } from '../../components/ui'
import { PageCard } from '../../components/cards'
import usePagination from '../../hooks/usePagination'
import { formatDisplayDate } from '../../utils/date'
import { getStored, setStored } from '../../utils/storage'
import '../shared.css'
import './Playlists.css'

type PlaylistRow = {
  id: string
  title: string | null
  description: string | null
  published_at: string | null
  privacy_status: string | null
  item_count: number | null
  thumbnail_url: string | null
  last_item_added_at: string | null
  total_playlist_views: number | null
  total_content_views: number | null
}

type PlaylistFilters = {
  q: string
  privacy_status: string
}

function Playlists() {
  const storedSort = getStored('playlistsSort', null as {
    sortKey?: 'title' | 'item_count' | 'total_playlist_views' | 'total_content_views' | 'last_item_added_at'
    sortDir?: 'asc' | 'desc'
  } | null)
  const storedFilters = getStored('playlistsFilters', null as Partial<PlaylistFilters> | null)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState<PlaylistRow[]>([])
  const [sortKey, setSortKey] = useState<'title' | 'item_count' | 'total_playlist_views' | 'total_content_views' | 'last_item_added_at'>(
    storedSort?.sortKey ?? 'last_item_added_at'
  )
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(storedSort?.sortDir ?? 'desc')
  const [filters, setFilters] = useState<PlaylistFilters>({
    q: storedFilters?.q ?? '',
    privacy_status: storedFilters?.privacy_status ?? '',
  })
  const navigate = useNavigate()
  const { page, setPage, pageSize, setPageSize, totalPages } = usePagination({ total, defaultPageSize: 10 })

  useEffect(() => {
    async function loadPlaylists() {
      try {
        const offset = (page - 1) * pageSize
        const params = new URLSearchParams({
          limit: String(pageSize),
          offset: String(offset),
          sort: sortKey,
          direction: sortDir,
        })
        if (filters.q) {
          params.set('q', filters.q)
        }
        if (filters.privacy_status) {
          params.set('privacy_status', filters.privacy_status)
        }
        const response = await fetch(`http://localhost:8000/playlists?${params.toString()}`)
        const data = await response.json()
        setRows(Array.isArray(data.items) ? data.items : [])
        setTotal(typeof data.total === 'number' ? data.total : 0)
      } catch (error) {
        console.error('Failed to load playlists', error)
      }
    }

    loadPlaylists()
  }, [page, pageSize, sortKey, sortDir, filters])

  useEffect(() => {
    setStored('playlistsSort', { sortKey, sortDir })
  }, [sortKey, sortDir])

  useEffect(() => {
    setStored('playlistsFilters', filters)
  }, [filters])

  const toggleSort = (key: 'title' | 'item_count' | 'total_playlist_views' | 'total_content_views' | 'last_item_added_at') => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir(key === 'title' ? 'asc' : 'desc')
    setPage(1)
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Playlists</h1>
      </header>
      <div className="page-body">
        <div className="page-row">
          <PageCard>
            <div className="filter-section">
              <div className="filter-title">Filters</div>
              <div className="filter-grid filter-grid-compact">
                <label className="filter-field">
                  <input
                    type="text"
                    placeholder="Title or ID"
                    value={filters.q}
                    onChange={(event) => {
                      setFilters((prev) => ({ ...prev, q: event.target.value }))
                      setPage(1)
                    }}
                  />
                </label>
                <Dropdown
                  value={filters.privacy_status}
                  onChange={(value) => {
                    setFilters((prev) => ({ ...prev, privacy_status: value }))
                    setPage(1)
                  }}
                  placeholder="All"
                  items={[
                    { type: 'option' as const, label: 'All', value: '' },
                    { type: 'option' as const, label: 'Public', value: 'public' },
                    { type: 'option' as const, label: 'Unlisted', value: 'unlisted' },
                    { type: 'option' as const, label: 'Private', value: 'private' },
                  ]}
                />
                <div className="filter-actions">
                  <ActionButton
                    label="Reset"
                    onClick={() => {
                      setFilters({ q: '', privacy_status: '' })
                      setPage(1)
                    }}
                    variant="soft"
                    className="filter-action"
                  />
                </div>
              </div>
            </div>
          </PageCard>
        </div>
        <div className="page-row">
          <PageCard>
            <div className="playlist-table">
              <div className="playlist-table-header">
                <span>Playlist</span>
                <span>Visibility</span>
                <button
                  type="button"
                  className={sortKey === 'item_count' ? 'video-sort-button active right' : 'video-sort-button right'}
                  onClick={() => toggleSort('item_count')}
                >
                  Items
                  {sortKey === 'item_count' ? <span className="video-sort">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
                </button>
                <button
                  type="button"
                  className={sortKey === 'total_playlist_views' ? 'video-sort-button active right' : 'video-sort-button right'}
                  onClick={() => toggleSort('total_playlist_views')}
                >
                  Playlist views
                  {sortKey === 'total_playlist_views' ? <span className="video-sort">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
                </button>
                <button
                  type="button"
                  className={sortKey === 'total_content_views' ? 'video-sort-button active right' : 'video-sort-button right'}
                  onClick={() => toggleSort('total_content_views')}
                >
                  Content views
                  {sortKey === 'total_content_views' ? <span className="video-sort">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
                </button>
                <button
                  type="button"
                  className={sortKey === 'last_item_added_at' ? 'video-sort-button active' : 'video-sort-button'}
                  onClick={() => toggleSort('last_item_added_at')}
                >
                  Last video added
                  {sortKey === 'last_item_added_at' ? <span className="video-sort">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
                </button>
              </div>
              {rows.length === 0 ? (
                <div className="video-table-empty">No playlists found.</div>
              ) : (
                rows.map((playlist) => (
                  <div key={playlist.id} className="playlist-table-row">
                    <div className="video-cell">
                      {playlist.thumbnail_url ? (
                        <img className="video-thumb" src={playlist.thumbnail_url} alt={playlist.title ?? 'Playlist'} />
                      ) : (
                        <div className="video-thumb" />
                      )}
                      <div className="video-meta">
                        <button
                          type="button"
                          className="video-title-button"
                          onClick={() => navigate(`/playlists/${playlist.id}`)}
                        >
                          {playlist.title || '(untitled)'}
                        </button>
                        <div className="video-muted playlist-desc">{playlist.description || '-'}</div>
                      </div>
                    </div>
                    <span className="video-muted">{playlist.privacy_status ?? '-'}</span>
                    <span className="right">{(playlist.item_count ?? 0).toLocaleString()}</span>
                    <span className="right">{(playlist.total_playlist_views ?? 0).toLocaleString()}</span>
                    <span className="right">{(playlist.total_content_views ?? 0).toLocaleString()}</span>
                    <span>{formatDisplayDate(playlist.last_item_added_at)}</span>
                  </div>
                ))
              )}
            </div>
            <div className="pagination-footer">
              <div className="pagination-main">
                <PageSwitcher currentPage={page} totalPages={totalPages} onPageChange={setPage} />
              </div>
              <div className="pagination-size">
                <PageSizePicker value={pageSize} onChange={setPageSize} />
              </div>
            </div>
          </PageCard>
        </div>
      </div>
    </section>
  )
}

export default Playlists



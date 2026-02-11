import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PageSizePicker, PageSwitcher } from '../components/ui'
import { PageCard } from '../components/layout'
import { PlaylistItemsTable, type PlaylistItemRowData, type PlaylistItemSortKey } from '../components/playlists'
import { formatDisplayDate } from '../utils/date'
import './Page.css'

type PlaylistMeta = {
  id: string
  title: string | null
  description: string | null
  published_at: string | null
  privacy_status: string | null
  item_count: number | null
  thumbnail_url: string | null
}

function PlaylistDetail() {
  const { playlistId } = useParams()
  const [meta, setMeta] = useState<PlaylistMeta | null>(null)
  const [items, setItems] = useState<PlaylistItemRowData[]>([])
  const [total, setTotal] = useState(0)
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [loadingItems, setLoadingItems] = useState(false)
  const [errorMeta, setErrorMeta] = useState<string | null>(null)
  const [errorItems, setErrorItems] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sortBy, setSortBy] = useState<PlaylistItemSortKey>('position')
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc')
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])

  useEffect(() => {
    async function loadMeta() {
      if (!playlistId) {
        setMeta(null)
        setErrorMeta('Missing playlist ID.')
        return
      }
      setLoadingMeta(true)
      setErrorMeta(null)
      try {
        const response = await fetch(`http://127.0.0.1:8000/playlists/${playlistId}`)
        if (!response.ok) {
          throw new Error(`Failed to load playlist (${response.status})`)
        }
        const data = await response.json()
        setMeta((data.item ?? null) as PlaylistMeta | null)
      } catch (err) {
        setErrorMeta(err instanceof Error ? err.message : 'Failed to load playlist.')
      } finally {
        setLoadingMeta(false)
      }
    }

    loadMeta()
  }, [playlistId])

  useEffect(() => {
    async function loadItems() {
      if (!playlistId) {
        setItems([])
        setTotal(0)
        setErrorItems('Missing playlist ID.')
        return
      }
      setLoadingItems(true)
      setErrorItems(null)
      try {
        const offset = (page - 1) * pageSize
        const params = new URLSearchParams({
          limit: String(pageSize),
          offset: String(offset),
          sort_by: sortBy,
          direction,
        })
        const response = await fetch(`http://127.0.0.1:8000/playlists/${playlistId}/items?${params.toString()}`)
        if (!response.ok) {
          throw new Error(`Failed to load playlist items (${response.status})`)
        }
        const data = await response.json()
        setItems(Array.isArray(data.items) ? (data.items as PlaylistItemRowData[]) : [])
        setTotal(typeof data.total === 'number' ? data.total : 0)
      } catch (err) {
        setErrorItems(err instanceof Error ? err.message : 'Failed to load playlist items.')
      } finally {
        setLoadingItems(false)
      }
    }

    loadItems()
  }, [playlistId, page, pageSize, sortBy, direction])

  useEffect(() => {
    setPage(1)
  }, [pageSize, sortBy, direction])

  const toggleSort = (key: PlaylistItemSortKey) => {
    if (sortBy === key) {
      setDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortBy(key)
    setDirection(key === 'position' ? 'asc' : 'desc')
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Playlist</h1>
      </header>
      <div className="page-body">
        <div className="page-row">
          <PageCard>
            {loadingMeta ? (
              <div className="video-detail-state">Loading playlist metadata...</div>
            ) : errorMeta ? (
              <div className="video-detail-state">{errorMeta}</div>
            ) : meta ? (
              <div className="video-detail-layout">
                <div className="video-detail-meta">
                  {meta.thumbnail_url ? (
                    <img className="video-detail-thumb" src={meta.thumbnail_url} alt={meta.title ?? 'Playlist'} />
                  ) : (
                    <div className="video-detail-thumb" />
                  )}
                  <div className="video-detail-meta-content">
                    <div className="video-detail-title">{meta.title || '(untitled)'}</div>
                    <div className="video-detail-description">{meta.description || '-'}</div>
                  </div>
                </div>
                <div className="video-detail-grid">
                  <div className="video-detail-item">
                    <span>Visibility</span>
                    <strong>{meta.privacy_status || '-'}</strong>
                  </div>
                  <div className="video-detail-item">
                    <span>Published</span>
                    <strong>{formatDisplayDate(meta.published_at)}</strong>
                  </div>
                  <div className="video-detail-item">
                    <span>Total items</span>
                    <strong>{(meta.item_count ?? 0).toLocaleString()}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="video-detail-state">Playlist metadata</div>
            )}
          </PageCard>
        </div>
        <div className="page-row">
          <PageCard>
            <div className="video-detail-toolbar">
              <div className="analytics-range-controls">
              </div>
            </div>
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
        </div>
      </div>
    </section>
  )
}

export default PlaylistDetail

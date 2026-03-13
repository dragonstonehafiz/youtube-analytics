import { useCallback, useEffect, useState } from 'react'
import type { PlaylistItemRowData, PlaylistItemSortKey } from '../../components/tables'
import usePagination from '../../hooks/usePagination'

type SortDirection = 'asc' | 'desc'

export type UsePlaylistItemsResult = {
  items: PlaylistItemRowData[]
  loadingItems: boolean
  errorItems: string | null
  sortBy: PlaylistItemSortKey
  direction: SortDirection
  page: number
  setPage: (page: number) => void
  pageSize: number
  setPageSize: (size: number) => void
  totalPages: number
  toggleSort: (key: PlaylistItemSortKey) => void
}

export function usePlaylistItems(playlistId: string | undefined): UsePlaylistItemsResult {
  const [items, setItems] = useState<PlaylistItemRowData[]>([])
  const [itemsTotal, setItemsTotal] = useState(0)
  const [loadingItems, setLoadingItems] = useState(false)
  const [errorItems, setErrorItems] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<PlaylistItemSortKey>('position')
  const [direction, setDirection] = useState<SortDirection>('asc')
  const { page, setPage, pageSize, setPageSize, totalPages } = usePagination({ total: itemsTotal, defaultPageSize: 10 })

  useEffect(() => { setPage(1) }, [sortBy, direction, setPage])

  useEffect(() => {
    async function load() {
      if (!playlistId) { setItems([]); setItemsTotal(0); return }
      setLoadingItems(true)
      setErrorItems(null)
      try {
        const offset = (page - 1) * pageSize
        const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset), sort_by: sortBy, direction })
        const res = await fetch(`http://localhost:8000/playlists/${playlistId}/items?${params}`)
        if (!res.ok) throw new Error(`Failed to load playlist items (${res.status})`)
        const data = await res.json()
        setItems(Array.isArray(data.items) ? (data.items as PlaylistItemRowData[]) : [])
        setItemsTotal(typeof data.total === 'number' ? data.total : 0)
      } catch (err) {
        setErrorItems(err instanceof Error ? err.message : 'Failed to load playlist items.')
      } finally {
        setLoadingItems(false)
      }
    }
    load()
  }, [playlistId, page, pageSize, sortBy, direction])

  const toggleSort = useCallback((key: PlaylistItemSortKey) => {
    if (sortBy === key) { setDirection((prev) => (prev === 'asc' ? 'desc' : 'asc')); return }
    setSortBy(key)
    setDirection(key === 'position' ? 'asc' : 'desc')
  }, [sortBy])

  return { items, loadingItems, errorItems, sortBy, direction, page, setPage, pageSize, setPageSize, totalPages, toggleSort }
}

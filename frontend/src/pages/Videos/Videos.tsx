import { useEffect, useMemo, useState } from 'react'
import { ActionButton, DateRangePicker, Dropdown, PageSizePicker, PageSwitcher } from '../../components/ui'
import { PageCard } from '../../components/cards'
import { VideoListTable, type VideoRow, type VideoSortKey } from '../../components/tables'
import { getSharedPageSize, getStored, setSharedPageSize, setStored } from '../../utils/storage'
import '../shared.css'
import './Videos.css'

type VideoFilters = {
  q: string
  privacy_status: string
  published_after: string
  published_before: string
  format: string
}

function Videos() {
  const [pageSize, setPageSize] = useState(() => getSharedPageSize(10))
  const storedSort = getStored('videosSort', null as {
    sortKey?: 'date' | 'views' | 'comments' | 'likes'
    sortDir?: 'asc' | 'desc'
  } | null)
  const storedFilters = getStored('videosFilters', null as Partial<VideoFilters> | null)
  const initialFilters: VideoFilters = {
    q: storedFilters?.q ?? '',
    privacy_status: storedFilters?.privacy_status ?? '',
    published_after: storedFilters?.published_after ?? '',
    published_before: storedFilters?.published_before ?? '',
    format: storedFilters?.format ?? '',
  }

  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [sortKey, setSortKey] = useState<VideoSortKey>(storedSort?.sortKey ?? 'date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(storedSort?.sortDir ?? 'desc')
  const [rows, setRows] = useState<VideoRow[]>([])
  const [filters, setFilters] = useState<VideoFilters>(initialFilters)

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])

  useEffect(() => {
    async function loadVideos() {
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
        if (filters.published_after) {
          params.set('published_after', filters.published_after)
        }
        if (filters.published_before) {
          params.set('published_before', filters.published_before)
        }
        if (filters.format) {
          params.set('content_type', filters.format)
        }
        const response = await fetch(`http://127.0.0.1:8000/videos?${params.toString()}`)
        const data = await response.json()
        setRows(Array.isArray(data.items) ? data.items : [])
        setTotal(typeof data.total === 'number' ? data.total : 0)
      } catch (error) {
        console.error('Failed to load videos', error)
      }
    }

    loadVideos()
  }, [page, pageSize, sortKey, sortDir, filters])

  useEffect(() => {
    setPage(1)
  }, [pageSize])

  useEffect(() => {
    setSharedPageSize(pageSize)
  }, [pageSize])

  useEffect(() => {
    setStored('videosSort', { sortKey, sortDir })
  }, [sortKey, sortDir])

  useEffect(() => {
    setStored('videosFilters', filters)
  }, [filters])

  const toggleSort = (key: VideoSortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('desc')
    setPage(1)
  }

  const updateFilter = (key: keyof VideoFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const resetFilters = () => {
    setFilters({ q: '', privacy_status: '', published_after: '', published_before: '', format: '' })
    setPage(1)
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Videos</h1>
      </header>
      <div className="page-body">
        <div className="page-row">
          <PageCard>
            <div className="filter-section">
              <div className="filter-title">Filters</div>
              <div className="filter-grid videos-filter-grid">
                <label className="filter-field">
                  <input
                    type="text"
                    placeholder="Title"
                    value={filters.q}
                    onChange={(event) => updateFilter('q', event.target.value)}
                  />
                </label>
                <Dropdown
                  value={filters.privacy_status}
                  onChange={(value) => updateFilter('privacy_status', value)}
                  placeholder="All"
                  items={[
                    { type: 'option' as const, label: 'All', value: '' },
                    { type: 'option' as const, label: 'Public', value: 'public' },
                    { type: 'option' as const, label: 'Unlisted', value: 'unlisted' },
                    { type: 'option' as const, label: 'Private', value: 'private' },
                  ]}
                />
                <Dropdown
                  value={filters.format}
                  onChange={(value) => updateFilter('format', value)}
                  placeholder="All Videos"
                  items={[
                    { type: 'option' as const, label: 'All Videos', value: '' },
                    { type: 'option' as const, label: 'Longform', value: 'video' },
                    { type: 'option' as const, label: 'Shortform', value: 'short' },
                  ]}
                />
                <div className="filter-field filter-date">
                  <DateRangePicker
                    startDate={filters.published_after}
                    endDate={filters.published_before}
                    onChange={(startDate, endDate) => {
                      setFilters((prev) => ({ ...prev, published_after: startDate, published_before: endDate }))
                      setPage(1)
                    }}
                  />
                </div>
                <div className="filter-actions">
                  <ActionButton label="Reset" onClick={resetFilters} variant="soft" className="filter-action" />
                </div>
              </div>
            </div>
          </PageCard>
        </div>

        <div className="page-row">
          <PageCard>
            <VideoListTable rows={rows} sortKey={sortKey} sortDir={sortDir} onToggleSort={toggleSort} />

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

export default Videos

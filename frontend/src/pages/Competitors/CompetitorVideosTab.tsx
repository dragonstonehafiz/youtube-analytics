import { useEffect, useState } from 'react'
import { ActionButton, DateRangePicker, Dropdown, PageSizePicker, PageSwitcher } from '../../components/ui'
import { PageCard } from '../../components/cards'
import { CompetitorListTable, type CompetitorVideoRow, type CompetitorSortKey } from '../../components/tables'
import usePagination from '../../hooks/usePagination'
import { getStored, setStored } from '../../utils/storage'

type CompetitorFilters = {
  q: string
  channel_id: string
  published_after: string
  published_before: string
  format: string
}

type ChannelOption = {
  label: string
  value: string
}

function CompetitorVideosTab() {
  const storedSort = getStored('competitorsSort', null as {
    sortKey?: CompetitorSortKey
    sortDir?: 'asc' | 'desc'
  } | null)
  const storedFilters = getStored('competitorsFilters', null as Partial<CompetitorFilters> | null)
  const initialFilters: CompetitorFilters = {
    q: storedFilters?.q ?? '',
    channel_id: storedFilters?.channel_id ?? '',
    published_after: storedFilters?.published_after ?? '',
    published_before: storedFilters?.published_before ?? '',
    format: storedFilters?.format ?? '',
  }

  const [total, setTotal] = useState(0)
  const [sortKey, setSortKey] = useState<CompetitorSortKey>(storedSort?.sortKey ?? 'date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(storedSort?.sortDir ?? 'desc')
  const [rows, setRows] = useState<CompetitorVideoRow[]>([])
  const [filters, setFilters] = useState<CompetitorFilters>(initialFilters)
  const [channelOptions, setChannelOptions] = useState<ChannelOption[]>([])

  const { page, setPage, pageSize, setPageSize, totalPages } = usePagination({ total, defaultPageSize: 10 })

  useEffect(() => {
    async function loadChannels() {
      try {
        const response = await fetch('http://localhost:8000/competitors')
        const data = await response.json()
        const options: ChannelOption[] = Object.values(data as Record<string, { label?: string; channel_id?: string }>)
          .filter((c) => c.channel_id)
          .map((c) => ({ label: c.label || c.channel_id!, value: c.channel_id! }))
        setChannelOptions(options)
      } catch {
        // ignore
      }
    }
    loadChannels()
  }, [])

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
        if (filters.q) params.set('q', filters.q)
        if (filters.channel_id) params.set('channel_id', filters.channel_id)
        if (filters.published_after) params.set('published_after', filters.published_after)
        if (filters.published_before) params.set('published_before', filters.published_before)
        if (filters.format) params.set('content_type', filters.format)
        const response = await fetch(`http://localhost:8000/competitors/videos?${params.toString()}`)
        const data = await response.json()
        setRows(Array.isArray(data.items) ? data.items : [])
        setTotal(typeof data.total === 'number' ? data.total : 0)
      } catch (error) {
        console.error('Failed to load competitor videos', error)
      }
    }
    loadVideos()
  }, [page, pageSize, sortKey, sortDir, filters])

  useEffect(() => {
    setStored('competitorsSort', { sortKey, sortDir })
  }, [sortKey, sortDir])

  useEffect(() => {
    setStored('competitorsFilters', filters)
  }, [filters])

  const toggleSort = (key: CompetitorSortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('desc')
    setPage(1)
  }

  const updateFilter = (key: keyof CompetitorFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const resetFilters = () => {
    setFilters({ q: '', channel_id: '', published_after: '', published_before: '', format: '' })
    setPage(1)
  }

  const channelDropdownItems = [
    { type: 'option' as const, label: 'All Channels', value: '' },
    ...channelOptions.map((c) => ({ type: 'option' as const, label: c.label, value: c.value })),
  ]

  return (
    <div className="page-body">
      <div className="page-row">
        <PageCard>
          <div className="filter-section">
            <div className="filter-title">Filters</div>
            <div className="filter-grid competitors-filter-grid">
              <label className="filter-field">
                <input
                  type="text"
                  placeholder="Title or ID"
                  value={filters.q}
                  onChange={(event) => updateFilter('q', event.target.value)}
                />
              </label>
              <Dropdown
                value={filters.channel_id}
                onChange={(value) => updateFilter('channel_id', value)}
                placeholder="All Channels"
                items={channelDropdownItems}
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
          <CompetitorListTable rows={rows} sortKey={sortKey} sortDir={sortDir} onToggleSort={toggleSort} />
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
  )
}

export default CompetitorVideosTab

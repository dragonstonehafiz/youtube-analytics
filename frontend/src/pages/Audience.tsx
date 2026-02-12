import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageCard } from '../components/layout'
import { ActionButton, Dropdown, PageSizePicker, PageSwitcher, ProfileImage } from '../components/ui'
import { formatDisplayDate } from '../utils/date'
import { getSharedPageSize, getStored, setSharedPageSize, setStored } from '../utils/storage'
import './Page.css'

type AudienceRow = {
  channel_id: string
  display_name: string | null
  profile_image_url: string | null
  is_public_subscriber: number
  subscribed_at: string | null
  first_commented_at: string | null
  last_commented_at: string | null
  comment_count: number
  total_comment_likes: number
  total_comment_replies: number
  updated_at: string
}

type AudienceSortKey =
  | 'subscribed_at'
  | 'first_commented_at'
  | 'last_commented_at'
  | 'comment_count'
  | 'total_comment_likes'
  | 'total_comment_replies'

function Audience() {
  const storedSort = getStored('audienceSort', null as { sortKey?: AudienceSortKey; sortDir?: 'asc' | 'desc' } | null)
  const storedFilters = getStored('audienceFilters', null as { q?: string; subscriberOnly?: string } | null)
  const [pageSize, setPageSize] = useState(() => getSharedPageSize(10))
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<AudienceRow[]>([])
  const [total, setTotal] = useState(0)
  const [sortKey, setSortKey] = useState<AudienceSortKey>(storedSort?.sortKey ?? 'last_commented_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(storedSort?.sortDir ?? 'desc')
  const [q, setQ] = useState(storedFilters?.q ?? '')
  const [subscriberOnly, setSubscriberOnly] = useState(storedFilters?.subscriberOnly ?? '')
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])

  useEffect(() => {
    async function loadAudience() {
      const offset = (page - 1) * pageSize
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
        sort_by: sortKey,
        direction: sortDir,
      })
      if (q.trim()) {
        params.set('q', q.trim())
      }
      if (subscriberOnly === 'yes') {
        params.set('subscriber_only', 'true')
      }
      const response = await fetch(`http://127.0.0.1:8000/audience?${params.toString()}`)
      const data = await response.json()
      setRows(Array.isArray(data.items) ? (data.items as AudienceRow[]) : [])
      setTotal(typeof data.total === 'number' ? data.total : 0)
    }
    loadAudience().catch((error) => console.error('Failed to load audience', error))
  }, [page, pageSize, sortKey, sortDir, q, subscriberOnly])

  useEffect(() => {
    setPage(1)
  }, [pageSize, q, subscriberOnly, sortKey, sortDir])

  useEffect(() => {
    setStored('audienceSort', { sortKey, sortDir })
  }, [sortKey, sortDir])

  useEffect(() => {
    setStored('audienceFilters', { q, subscriberOnly })
  }, [q, subscriberOnly])

  useEffect(() => {
    setSharedPageSize(pageSize)
  }, [pageSize])

  const toggleSort = (nextKey: AudienceSortKey) => {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(nextKey)
    setSortDir('desc')
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Audience</h1>
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
                    placeholder="Name"
                    value={q}
                    onChange={(event) => setQ(event.target.value)}
                  />
                </label>
                <div className="filter-field">
                  <Dropdown
                    value={subscriberOnly}
                    onChange={setSubscriberOnly}
                    placeholder="All audience"
                    items={[
                      { type: 'option' as const, label: 'All audience', value: '' },
                      { type: 'option' as const, label: 'Public subscribers', value: 'yes' },
                    ]}
                  />
                </div>
                <div className="filter-actions">
                  <ActionButton
                    label="Reset"
                    onClick={() => {
                      setQ('')
                      setSubscriberOnly('')
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
            <div className="audience-table">
              <div className="audience-table-header">
                <span>Audience</span>
                <span>Subscriber</span>
                <button
                  className={`video-sort-button ${sortKey === 'subscribed_at' ? 'active' : ''}`}
                  onClick={() => toggleSort('subscribed_at')}
                >
                  Subscribed {sortKey === 'subscribed_at' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </button>
                <button
                  className={`video-sort-button ${sortKey === 'first_commented_at' ? 'active' : ''}`}
                  onClick={() => toggleSort('first_commented_at')}
                >
                  First comment {sortKey === 'first_commented_at' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </button>
                <button
                  className={`video-sort-button ${sortKey === 'last_commented_at' ? 'active' : ''}`}
                  onClick={() => toggleSort('last_commented_at')}
                >
                  Last comment {sortKey === 'last_commented_at' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </button>
                <button
                  className={`video-sort-button right ${sortKey === 'comment_count' ? 'active' : ''}`}
                  onClick={() => toggleSort('comment_count')}
                >
                  Comments {sortKey === 'comment_count' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </button>
                <button
                  className={`video-sort-button right ${sortKey === 'total_comment_likes' ? 'active' : ''}`}
                  onClick={() => toggleSort('total_comment_likes')}
                >
                  Total likes {sortKey === 'total_comment_likes' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </button>
                <button
                  className={`video-sort-button right ${sortKey === 'total_comment_replies' ? 'active' : ''}`}
                  onClick={() => toggleSort('total_comment_replies')}
                >
                  Total replies {sortKey === 'total_comment_replies' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </button>
              </div>
              {rows.length === 0 ? (
                <div className="video-table-empty">No audience rows found.</div>
              ) : (
                rows.map((row) => (
                  <div className="audience-table-row" key={row.channel_id}>
                    <div className="audience-cell">
                      <ProfileImage
                        className="audience-avatar"
                        src={row.profile_image_url}
                        name={row.display_name}
                      />
                      <div className="audience-meta">
                        <Link to={`/audienceDetails/${row.channel_id}`} className="audience-name-link">
                          {row.display_name || '(unknown)'}
                        </Link>
                      </div>
                    </div>
                    <span>{row.is_public_subscriber ? 'Yes' : 'No'}</span>
                    <span>{formatDisplayDate(row.subscribed_at)}</span>
                    <span>{formatDisplayDate(row.first_commented_at)}</span>
                    <span>{formatDisplayDate(row.last_commented_at)}</span>
                    <span className="right">{(row.comment_count ?? 0).toLocaleString()}</span>
                    <span className="right">{(row.total_comment_likes ?? 0).toLocaleString()}</span>
                    <span className="right">{(row.total_comment_replies ?? 0).toLocaleString()}</span>
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

export default Audience

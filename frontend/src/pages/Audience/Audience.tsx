import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageCard } from '@components/ui'
import { ActionButton, Dropdown, PageSizePicker, PageSwitcher, ProfileImage, DisplayDate } from '@components/ui'
import usePagination from '@hooks/usePagination'
import { getStored, setStored } from '@utils/storage'
import '../shared.css'
import './Audience.css'

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

  const [rows, setRows] = useState<AudienceRow[]>([])
  const [total, setTotal] = useState(0)
  const [sortKey, setSortKey] = useState<AudienceSortKey>(storedSort?.sortKey ?? 'last_commented_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(storedSort?.sortDir ?? 'desc')
  const [q, setQ] = useState(storedFilters?.q ?? '')
  const [subscriberOnly, setSubscriberOnly] = useState(storedFilters?.subscriberOnly ?? '')
  const { page, setPage, pageSize, setPageSize, totalPages } = usePagination({ total, defaultPageSize: 10 })

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
      const response = await fetch(`http://localhost:8000/audience?${params.toString()}`)
      const data = await response.json()
      setRows(Array.isArray(data.items) ? (data.items as AudienceRow[]) : [])
      setTotal(typeof data.total === 'number' ? data.total : 0)
    }
    loadAudience().catch((error) => console.error('Failed to load audience', error))
  }, [page, pageSize, sortKey, sortDir, q, subscriberOnly])

  useEffect(() => {
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize, q, subscriberOnly, sortKey, sortDir])

  useEffect(() => {
    setStored('audienceSort', { sortKey, sortDir })
  }, [sortKey, sortDir])

  useEffect(() => {
    setStored('audienceFilters', { q, subscriberOnly })
  }, [q, subscriberOnly])


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
            {rows.length === 0 ? (
              <div className="video-table-empty">No audience rows found.</div>
            ) : (
              <table className="audience-table">
                <thead>
                  <tr>
                    <th>Audience</th>
                    <th>Subscriber</th>
                    <th>
                      <button
                        className={`table-sort-button ${sortKey === 'subscribed_at' ? 'active' : ''}`}
                        onClick={() => toggleSort('subscribed_at')}
                      >
                        Subscribed {sortKey === 'subscribed_at' ? <span className="sort-arrow">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
                      </button>
                    </th>
                    <th>
                      <button
                        className={`table-sort-button ${sortKey === 'first_commented_at' ? 'active' : ''}`}
                        onClick={() => toggleSort('first_commented_at')}
                      >
                        First comment {sortKey === 'first_commented_at' ? <span className="sort-arrow">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
                      </button>
                    </th>
                    <th>
                      <button
                        className={`table-sort-button ${sortKey === 'last_commented_at' ? 'active' : ''}`}
                        onClick={() => toggleSort('last_commented_at')}
                      >
                        Last comment {sortKey === 'last_commented_at' ? <span className="sort-arrow">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
                      </button>
                    </th>
                    <th>
                      <button
                        className={`table-sort-button ${sortKey === 'comment_count' ? 'active' : ''}`}
                        onClick={() => toggleSort('comment_count')}
                      >
                        Comments {sortKey === 'comment_count' ? <span className="sort-arrow">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
                      </button>
                    </th>
                    <th>
                      <button
                        className={`table-sort-button ${sortKey === 'total_comment_likes' ? 'active' : ''}`}
                        onClick={() => toggleSort('total_comment_likes')}
                      >
                        Total likes {sortKey === 'total_comment_likes' ? <span className="sort-arrow">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
                      </button>
                    </th>
                    <th>
                      <button
                        className={`table-sort-button ${sortKey === 'total_comment_replies' ? 'active' : ''}`}
                        onClick={() => toggleSort('total_comment_replies')}
                      >
                        Total replies {sortKey === 'total_comment_replies' ? <span className="sort-arrow">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.channel_id}>
                      <td className="audience-cell">
                        <ProfileImage
                          size={34}
                          src={row.profile_image_url}
                          name={row.display_name}
                        />
                        <div className="audience-meta">
                          <Link to={`/audience/${row.channel_id}`} className="audience-name-link">
                            {row.display_name || '(unknown)'}
                          </Link>
                        </div>
                      </td>
                      <td>{row.is_public_subscriber ? 'Yes' : 'No'}</td>
                      <td><DisplayDate date={row.subscribed_at} /></td>
                      <td><DisplayDate date={row.first_commented_at} /></td>
                      <td><DisplayDate date={row.last_commented_at} /></td>
                      <td>{(row.comment_count ?? 0).toLocaleString()}</td>
                      <td>{(row.total_comment_likes ?? 0).toLocaleString()}</td>
                      <td>{(row.total_comment_replies ?? 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

export default Audience




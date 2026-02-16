import { useEffect, useMemo, useState } from 'react'
import { CommentsSection, buildCommentGroups, type CommentApiRow } from '../../components/comments'
import { PageCard } from '../../components/layout'
import { ActionButton, DateRangePicker, Dropdown, PageSizePicker, PageSwitcher } from '../../components/ui'
import { getSharedPageSize, getStored, setSharedPageSize, setStored } from '../../utils/storage'
import '../shared.css'
import './Comments.css'

type StoredCommentsSettings = {
  pageSize?: number
  sortBy?: CommentSort
  postedAfter?: string
  postedBefore?: string
  page?: number
}

type CommentSort = 'published_at' | 'likes' | 'reply_count'

function Comments() {
  const storedSettings = getStored('commentsPageSettings', null as StoredCommentsSettings | null)
  const [pageSize, setPageSize] = useState(() => getSharedPageSize(storedSettings?.pageSize ?? 10))
  const [sortBy, setSortBy] = useState<CommentSort>(storedSettings?.sortBy ?? 'published_at')
  const [rows, setRows] = useState<CommentApiRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(storedSettings?.page ?? 1)
  const [total, setTotal] = useState(0)
  const [postedAfter, setPostedAfter] = useState(storedSettings?.postedAfter ?? '')
  const [postedBefore, setPostedBefore] = useState(storedSettings?.postedBefore ?? '')
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])
  const groups = useMemo(() => buildCommentGroups(rows), [rows])

  useEffect(() => {
    async function loadCommentsPage() {
      setLoading(true)
      setError(null)
      try {
        const offset = (page - 1) * pageSize
        const params = new URLSearchParams({
          limit: String(pageSize),
          offset: String(offset),
          sort_by: sortBy,
          direction: 'desc',
        })
        if (postedAfter) {
          params.set('published_after', postedAfter)
        }
        if (postedBefore) {
          params.set('published_before', postedBefore)
        }
        const response = await fetch(`http://127.0.0.1:8000/comments?${params.toString()}`)
        if (!response.ok) {
          throw new Error(`Failed to load comments (${response.status})`)
        }
        const data = await response.json()
        setRows(Array.isArray(data.items) ? (data.items as CommentApiRow[]) : [])
        setTotal(typeof data.total === 'number' ? data.total : 0)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load comments.')
      } finally {
        setLoading(false)
      }
    }

    loadCommentsPage()
  }, [page, pageSize, postedAfter, postedBefore, sortBy])

  useEffect(() => {
    setPage(1)
  }, [postedAfter, postedBefore, sortBy, pageSize])

  useEffect(() => {
    setSharedPageSize(pageSize)
  }, [pageSize])

  useEffect(() => {
    setStored('commentsPageSettings', {
      pageSize,
      sortBy,
      postedAfter,
      postedBefore,
      page,
    } satisfies StoredCommentsSettings)
  }, [pageSize, sortBy, postedAfter, postedBefore, page])

  return (
    <section className="page">
      <header className="page-header">
        <h1>Comments</h1>
      </header>
      <div className="page-body">
        <div className="page-row">
          <PageCard>
            <div className="filter-section">
              <div className="filter-title">Filters</div>
              <div className="filter-grid filter-grid-compact">
                <div className="filter-field filter-date">
                  <DateRangePicker
                    startDate={postedAfter}
                    endDate={postedBefore}
                    onChange={(startDate, endDate) => {
                      setPostedAfter(startDate)
                      setPostedBefore(endDate)
                    }}
                  />
                </div>
                <div className="filter-field">
                  <Dropdown
                    value={sortBy}
                    onChange={(value) => setSortBy(value as CommentSort)}
                    placeholder="Date posted"
                    items={[
                      { type: 'option' as const, label: 'Date posted', value: 'published_at' },
                      { type: 'option' as const, label: 'Likes', value: 'likes' },
                      { type: 'option' as const, label: 'Reply count', value: 'reply_count' },
                    ]}
                  />
                </div>
                <div className="filter-actions">
                  <ActionButton
                    label="Reset"
                    onClick={() => {
                      setPostedAfter('')
                      setPostedBefore('')
                      setSortBy('published_at')
                    }}
                    variant="soft"
                    className="filter-action"
                  />
                </div>
              </div>
            </div>
          </PageCard>
        </div>
        <CommentsSection
          groups={groups}
          loading={loading}
          error={error}
          footer={(
            <div className="pagination-footer">
              <div className="pagination-main">
                <PageSwitcher currentPage={page} totalPages={totalPages} onPageChange={setPage} />
              </div>
              <div className="pagination-size">
                <PageSizePicker value={pageSize} onChange={setPageSize} />
              </div>
            </div>
          )}
        />
      </div>
    </section>
  )
}

export default Comments

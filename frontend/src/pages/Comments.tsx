import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CommentThreadItem, type CommentRow, type CommentThread } from '../components/comments'
import { PageCard } from '../components/layout'
import { ActionButton, DateRangePicker, Dropdown, PageSizePicker, PageSwitcher } from '../components/ui'
import { getStored, setStored } from '../utils/storage'
import './Page.css'

type CommentApiRow = CommentRow & {
  video_id: string
  video_title?: string | null
  video_thumbnail_url?: string | null
}

type CommentGroup = {
  videoId: string
  videoTitle: string
  videoThumbnailUrl: string | null
  comments: CommentThread[]
}

function Comments() {
  const storedSettings = getStored('commentsPageSettings', null as {
    pageSize?: number
    sortBy?: 'published_at' | 'likes' | 'reply_count'
    postedAfter?: string
    postedBefore?: string
    page?: number
  } | null)
  const [pageSize, setPageSize] = useState(storedSettings?.pageSize ?? 10)
  const [sortBy, setSortBy] = useState<'published_at' | 'likes' | 'reply_count'>(storedSettings?.sortBy ?? 'published_at')
  const [rows, setRows] = useState<CommentApiRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(storedSettings?.page ?? 1)
  const [total, setTotal] = useState(0)
  const [postedAfter, setPostedAfter] = useState(storedSettings?.postedAfter ?? '')
  const [postedBefore, setPostedBefore] = useState(storedSettings?.postedBefore ?? '')

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
        const response = await fetch(
          `http://127.0.0.1:8000/comments?${params.toString()}`
        )
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
    setStored('commentsPageSettings', {
      pageSize,
      sortBy,
      postedAfter,
      postedBefore,
      page,
    })
  }, [pageSize, sortBy, postedAfter, postedBefore, page])
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])

  const groups = useMemo(() => {
    const getTime = (value: string | null) => (value ? new Date(value).getTime() : 0)
    const byVideoRows = new Map<string, CommentApiRow[]>()
    rows.forEach((row) => {
      if (!row.video_id) {
        return
      }
      const existing = byVideoRows.get(row.video_id)
      if (existing) {
        existing.push(row)
      } else {
        byVideoRows.set(row.video_id, [row])
      }
    })
    const byVideo = new Map<string, CommentGroup>()
    rows.forEach((row) => {
      const videoId = row.video_id || ''
      if (!videoId) {
        return
      }
      if (byVideo.has(videoId)) {
        return
      }
      const videoRows = byVideoRows.get(videoId) ?? []
      byVideo.set(videoId, {
        videoId,
        videoTitle: row.video_title && row.video_title.trim() ? row.video_title : '(untitled video)',
        videoThumbnailUrl: row.video_thumbnail_url && row.video_thumbnail_url.trim() ? row.video_thumbnail_url : null,
        comments: videoRows
          .map((parent) => ({
            parent,
            replies: [],
            repliesTotal: parent.reply_count ?? 0,
          }))
          .sort((a, b) => getTime(b.parent.published_at) - getTime(a.parent.published_at)),
      })
    })
    return Array.from(byVideo.values())
  }, [rows])

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
                    onChange={(value) => setSortBy(value as 'published_at' | 'likes' | 'reply_count')}
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
        <div className="page-row">
          <PageCard>
            {loading ? (
              <div className="video-detail-state">Loading comments...</div>
            ) : error ? (
              <div className="video-detail-state">{error}</div>
            ) : groups.length === 0 ? (
              <div className="video-detail-state">No comments found.</div>
            ) : (
              <div className="comments-groups">
                {groups.map((group) => (
                  <section key={group.videoId} className="comments-group">
                    <header className="comments-group-header">
                      <div className="comments-group-video">
                        {group.videoThumbnailUrl ? (
                          <img className="comments-group-thumb" src={group.videoThumbnailUrl} alt={group.videoTitle} />
                        ) : (
                          <div className="comments-group-thumb" />
                        )}
                        <Link to={`/videoDetails/${group.videoId}?tab=comments`} className="comments-group-title">
                          {group.videoTitle}
                        </Link>
                      </div>
                      <span className="comments-group-count">{group.comments.length.toLocaleString()} threads</span>
                    </header>
                    <div className="comments-group-items">
                      {group.comments.map((thread) => (
                        <CommentThreadItem key={thread.parent.id} thread={thread} videoId={group.videoId} />
                      ))}
                    </div>
                  </section>
                ))}
                <div className="pagination-footer">
                  <div className="pagination-main">
                    <PageSwitcher currentPage={page} totalPages={totalPages} onPageChange={setPage} />
                  </div>
                  <div className="pagination-size">
                    <PageSizePicker value={pageSize} onChange={setPageSize} />
                  </div>
                </div>
              </div>
            )}
          </PageCard>
        </div>
      </div>
    </section>
  )
}

export default Comments

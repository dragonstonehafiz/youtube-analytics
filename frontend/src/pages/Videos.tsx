import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActionButton } from '../components/ui'
import { PageCard } from '../components/layout'
import { getStored, setStored } from '../utils/storage'
import './Page.css'

function Videos() {
  const pageSize = 25
  const storedSort = getStored('videosSort', null as {
    sortKey?: 'date' | 'views' | 'comments' | 'likes'
    sortDir?: 'asc' | 'desc'
  } | null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [sortKey, setSortKey] = useState<'date' | 'views' | 'comments' | 'likes'>(
    storedSort?.sortKey ?? 'date'
  )
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(storedSort?.sortDir ?? 'desc')
  const [rows, setRows] = useState<
    {
      id: string
      title: string
      description: string | null
      published_at: string | null
      view_count: number | null
      like_count: number | null
      comment_count: number | null
      duration_seconds: number | null
      thumbnail_url: string | null
    }[]
  >([])
  const navigate = useNavigate()

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total])
  const sortedRows = useMemo(() => rows, [rows])
  const pagination = useMemo(() => {
    if (totalPages <= 3) {
      return Array.from({ length: totalPages }, (_, idx) => idx + 1)
    }
    const start = Math.max(1, Math.min(page - 1, totalPages - 2))
    return [start, start + 1, start + 2]
  }, [page, totalPages])

  useEffect(() => {
    async function loadVideos() {
      try {
        const offset = (page - 1) * pageSize
        const response = await fetch(
          `http://127.0.0.1:8000/videos?limit=${pageSize}&offset=${offset}&sort=${sortKey}&direction=${sortDir}`
        )
        const data = await response.json()
        setRows(Array.isArray(data.items) ? data.items : [])
        setTotal(typeof data.total === 'number' ? data.total : 0)
      } catch (error) {
        console.error('Failed to load videos', error)
      }
    }

    loadVideos()
  }, [page, sortKey, sortDir])

  useEffect(() => {
    setStored('videosSort', { sortKey, sortDir })
  }, [sortKey, sortDir])

  const toggleSort = (key: 'date' | 'views' | 'comments' | 'likes') => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('desc')
    setPage(1)
  }

  const formatDuration = (seconds: number | null) => {
    if (!seconds) {
      return '—'
    }
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Videos</h1>
      </header>
      <div className="page-body">
        <PageCard>
          <div className="video-table">
            <div className="video-table-header">
              <span>Video</span>
              <span>Visibility</span>
              <span>Restrictions</span>
              <button
                type="button"
                className={sortKey === 'date' ? 'video-sort-button active' : 'video-sort-button'}
                onClick={() => toggleSort('date')}
              >
                Date
                {sortKey === 'date' ? (
                  <span className="video-sort">{sortDir === 'asc' ? '↑' : '↓'}</span>
                ) : null}
              </button>
              <button
                type="button"
                className={sortKey === 'views' ? 'video-sort-button active right' : 'video-sort-button right'}
                onClick={() => toggleSort('views')}
              >
                Views
                {sortKey === 'views' ? (
                  <span className="video-sort">{sortDir === 'asc' ? '↑' : '↓'}</span>
                ) : null}
              </button>
              <button
                type="button"
                className={sortKey === 'comments' ? 'video-sort-button active right' : 'video-sort-button right'}
                onClick={() => toggleSort('comments')}
              >
                Comments
                {sortKey === 'comments' ? (
                  <span className="video-sort">{sortDir === 'asc' ? '↑' : '↓'}</span>
                ) : null}
              </button>
              <button
                type="button"
                className={sortKey === 'likes' ? 'video-sort-button active right' : 'video-sort-button right'}
                onClick={() => toggleSort('likes')}
              >
                Likes
                {sortKey === 'likes' ? (
                  <span className="video-sort">{sortDir === 'asc' ? '↑' : '↓'}</span>
                ) : null}
              </button>
            </div>
            {rows.length === 0 ? (
              <div className="video-table-empty">No videos found.</div>
            ) : (
              sortedRows.map((video) => (
                <div key={video.id} className="video-table-row">
                  <div className="video-cell">
                    {video.thumbnail_url ? (
                      <img className="video-thumb" src={video.thumbnail_url} alt={video.title} />
                    ) : (
                      <div className="video-thumb" />
                    )}
                    <div className="video-meta">
                      <div className="video-title">{video.title}</div>
                      <div className="video-detail-sub">
                        <div className="video-desc">{video.description ? video.description : '—'}</div>
                        <div className="video-actions">
                          <ActionButton
                            label="YouTube"
                            onClick={() => window.open(`https://www.youtube.com/watch?v=${video.id}`, '_blank')}
                            variant="soft"
                            className="video-action"
                          />
                          <ActionButton
                            label="Analytics"
                            onClick={() => navigate(`/videos/${video.id}?tab=analytics`)}
                            variant="soft"
                            className="video-action"
                          />
                          <ActionButton
                            label="Comments"
                            onClick={() => navigate(`/videos/${video.id}?tab=comments`)}
                            variant="soft"
                            className="video-action"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <span className="video-muted">{video.privacy_status ?? '—'}</span>
                  <span className="video-muted">—</span>
                  <span>{video.published_at ? new Date(video.published_at).toLocaleDateString() : '—'}</span>
                  <span className="right">{(video.view_count ?? 0).toLocaleString()}</span>
                  <span className="right">{(video.comment_count ?? 0).toLocaleString()}</span>
                  <span className="right">{(video.like_count ?? 0).toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
          <div className="video-pagination">
            <ActionButton
              label="<<"
              onClick={() => setPage(1)}
              disabled={page <= 1}
              variant="soft"
              className="video-page"
            />
            <ActionButton
              label="<"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              variant="soft"
              className="video-page"
            />
            {pagination.map((item) => (
              <ActionButton
                key={item}
                label={String(item)}
                onClick={() => setPage(item)}
                variant="soft"
                active={item === page}
                className="video-page"
              />
            ))}
            <ActionButton
              label=">"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              variant="soft"
              className="video-page"
            />
            <ActionButton
              label=">>"
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              variant="soft"
              className="video-page"
            />
          </div>
        </PageCard>
      </div>
    </section>
  )
}

export default Videos

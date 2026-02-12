import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CommentVideoGroup, type CommentRow, type CommentThread } from '../components/comments'
import { PageCard } from '../components/layout'
import { ActionButton, Dropdown, PageSizePicker, PageSwitcher, ProfileImage } from '../components/ui'
import { formatDisplayDate } from '../utils/date'
import { getSharedPageSize, setSharedPageSize } from '../utils/storage'
import './Page.css'

type AudienceDetailRow = {
  channel_id: string
  display_name: string | null
  profile_image_url: string | null
  is_public_subscriber: number
  subscribed_at: string | null
  first_commented_at: string | null
  last_commented_at: string | null
  comment_count: number
}

type AudienceStats = {
  total_comments: number
  distinct_videos: number
  total_comment_likes: number
  first_comment_at: string | null
  last_comment_at: string | null
}

type AudienceCommentRow = CommentRow & {
  video_id: string
  video_title?: string | null
  video_thumbnail_url?: string | null
}

type AudienceCommentGroup = {
  videoId: string
  videoTitle: string
  videoThumbnailUrl: string | null
  comments: CommentThread[]
}

function AudienceDetail() {
  const { channelId } = useParams()
  const navigate = useNavigate()
  const [item, setItem] = useState<AudienceDetailRow | null>(null)
  const [stats, setStats] = useState<AudienceStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [commentRows, setCommentRows] = useState<AudienceCommentRow[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsError, setCommentsError] = useState<string | null>(null)
  const [commentsSort, setCommentsSort] = useState<'published_at' | 'likes' | 'reply_count'>('published_at')
  const [commentsDirection, setCommentsDirection] = useState<'asc' | 'desc'>('desc')
  const [commentsPage, setCommentsPage] = useState(1)
  const [commentsTotal, setCommentsTotal] = useState(0)
  const [commentsPageSize, setCommentsPageSize] = useState(() => getSharedPageSize(10))
  const commentsTotalPages = useMemo(() => Math.max(1, Math.ceil(commentsTotal / commentsPageSize)), [commentsTotal, commentsPageSize])
  const commentGroups = useMemo<AudienceCommentGroup[]>(() => {
    const byVideoRows = new Map<string, AudienceCommentRow[]>()
    commentRows.forEach((row) => {
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
    const byVideo = new Map<string, AudienceCommentGroup>()
    commentRows.forEach((row) => {
      const videoId = row.video_id || ''
      if (!videoId || byVideo.has(videoId)) {
        return
      }
      const videoRows = byVideoRows.get(videoId) ?? []
      byVideo.set(videoId, {
        videoId,
        videoTitle: row.video_title && row.video_title.trim() ? row.video_title : '(untitled video)',
        videoThumbnailUrl: row.video_thumbnail_url && row.video_thumbnail_url.trim() ? row.video_thumbnail_url : null,
        comments: videoRows.map((entry) => ({
          parent: entry,
          replies: [],
          repliesTotal: entry.reply_count ?? 0,
        })),
      })
    })
    return Array.from(byVideo.values())
  }, [commentRows])

  useEffect(() => {
    async function loadAudienceDetail() {
      if (!channelId) {
        setError('Missing channel ID.')
        return
      }
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`http://127.0.0.1:8000/audience/${encodeURIComponent(channelId)}`)
        if (!response.ok) {
          throw new Error(`Failed to load audience member (${response.status})`)
        }
        const data = await response.json()
        setItem((data.item ?? null) as AudienceDetailRow | null)
        setStats((data.stats ?? null) as AudienceStats | null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load audience member.')
      } finally {
        setLoading(false)
      }
    }
    loadAudienceDetail()
  }, [channelId])

  useEffect(() => {
    async function loadComments() {
      if (!channelId) {
        return
      }
      setCommentsLoading(true)
      setCommentsError(null)
      try {
        const offset = (commentsPage - 1) * commentsPageSize
        const params = new URLSearchParams({
          author_channel_id: channelId,
          limit: String(commentsPageSize),
          offset: String(offset),
          sort_by: commentsSort,
          direction: commentsDirection,
        })
        const response = await fetch(`http://127.0.0.1:8000/comments?${params.toString()}`)
        if (!response.ok) {
          throw new Error(`Failed to load comments (${response.status})`)
        }
        const data = await response.json()
        setCommentRows(Array.isArray(data.items) ? (data.items as AudienceCommentRow[]) : [])
        setCommentsTotal(typeof data.total === 'number' ? data.total : 0)
      } catch (err) {
        setCommentsError(err instanceof Error ? err.message : 'Failed to load comments.')
      } finally {
        setCommentsLoading(false)
      }
    }
    loadComments()
  }, [channelId, commentsPage, commentsPageSize, commentsSort, commentsDirection])

  useEffect(() => {
    setCommentsPage(1)
  }, [commentsSort, commentsDirection, commentsPageSize, channelId])

  useEffect(() => {
    setSharedPageSize(commentsPageSize)
  }, [commentsPageSize])

  return (
    <section className="page">
      <header className="page-header">
        <div className="header-inline-title">
          <ActionButton label="<" onClick={() => navigate(-1)} variant="soft" bordered={false} className="header-back-action" />
          <h1>Audience Detail</h1>
        </div>
      </header>
      <div className="page-body">
        <div className="page-row">
          <PageCard>
            {loading ? (
              <div className="video-detail-state">Loading audience details...</div>
            ) : error ? (
              <div className="video-detail-state">{error}</div>
            ) : item ? (
              <div className="audience-detail-layout">
                <div className="audience-detail-main">
                  <ProfileImage className="audience-detail-avatar" src={item.profile_image_url} name={item.display_name} />
                  <div className="audience-detail-main-text">
                    <div className="audience-detail-name">{item.display_name || '(unknown)'}</div>
                  </div>
                </div>
                <div className="video-detail-grid">
                  <div className="video-detail-item">
                    <span>Public subscriber</span>
                    <strong>{item.is_public_subscriber ? 'Yes' : 'No'}</strong>
                  </div>
                  <div className="video-detail-item">
                    <span>Subscribed</span>
                    <strong>{formatDisplayDate(item.subscribed_at)}</strong>
                  </div>
                  <div className="video-detail-item">
                    <span>First comment</span>
                    <strong>{formatDisplayDate(item.first_commented_at)}</strong>
                  </div>
                  <div className="video-detail-item">
                    <span>Last comment</span>
                    <strong>{formatDisplayDate(item.last_commented_at)}</strong>
                  </div>
                  <div className="video-detail-item">
                    <span>Comment count</span>
                    <strong>{(item.comment_count ?? 0).toLocaleString()}</strong>
                  </div>
                  <div className="video-detail-item">
                    <span>Distinct videos</span>
                    <strong>{(stats?.distinct_videos ?? 0).toLocaleString()}</strong>
                  </div>
                  <div className="video-detail-item">
                    <span>Total comment likes</span>
                    <strong>{(stats?.total_comment_likes ?? 0).toLocaleString()}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="video-detail-state">Audience member not found.</div>
            )}
          </PageCard>
        </div>

        <div className="page-row">
          <PageCard>
            <div className="video-detail-toolbar audience-detail-comments-toolbar">
              <div className="analytics-range-controls">
                <Dropdown
                  value={commentsSort}
                  onChange={(value) => setCommentsSort(value as 'published_at' | 'likes' | 'reply_count')}
                  placeholder="Date posted"
                  items={[
                    { type: 'option' as const, label: 'Date posted', value: 'published_at' },
                    { type: 'option' as const, label: 'Likes', value: 'likes' },
                    { type: 'option' as const, label: 'Reply count', value: 'reply_count' },
                  ]}
                />
                <Dropdown
                  value={commentsDirection}
                  onChange={(value) => setCommentsDirection(value as 'asc' | 'desc')}
                  placeholder="Descending"
                  items={[
                    { type: 'option' as const, label: 'Descending', value: 'desc' },
                    { type: 'option' as const, label: 'Ascending', value: 'asc' },
                  ]}
                />
              </div>
            </div>

            {commentsLoading ? (
              <div className="video-detail-state">Loading comments...</div>
            ) : commentsError ? (
              <div className="video-detail-state">{commentsError}</div>
            ) : commentGroups.length === 0 ? (
              <div className="video-detail-state">No comments found for this audience member.</div>
            ) : (
              <div className="comments-groups">
                {commentGroups.map((group) => (
                  <CommentVideoGroup
                    key={group.videoId}
                    videoId={group.videoId}
                    videoTitle={group.videoTitle}
                    videoThumbnailUrl={group.videoThumbnailUrl}
                    comments={group.comments}
                  />
                ))}
                <div className="pagination-footer">
                  <div className="pagination-main">
                    <PageSwitcher currentPage={commentsPage} totalPages={commentsTotalPages} onPageChange={setCommentsPage} />
                  </div>
                  <div className="pagination-size">
                    <PageSizePicker value={commentsPageSize} onChange={setCommentsPageSize} />
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

export default AudienceDetail

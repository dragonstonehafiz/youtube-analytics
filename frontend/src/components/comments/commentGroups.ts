import type { CommentRow, CommentThread } from './CommentThreadItem'

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

function buildCommentGroups(rows: CommentApiRow[]): CommentGroup[] {
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
    if (!videoId || byVideo.has(videoId)) {
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
}

export { buildCommentGroups }
export type { CommentApiRow, CommentGroup }

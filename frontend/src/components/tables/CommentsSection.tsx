import type { ReactNode } from 'react'
import CommentVideoGroup from './CommentVideoGroup'
import { PageCard } from '../ui'
import type { CommentGroup } from '@utils/commentGroups'
import './CommentsSection.css'

type CommentsSectionProps = {
  groups: CommentGroup[]
  loading?: boolean
  error?: string | null
  emptyText?: string
  loadingText?: string
  footer?: ReactNode
}

function CommentsSection({
  groups,
  loading = false,
  error = null,
  emptyText = 'No comments found.',
  loadingText = 'Loading comments...',
  footer,
}: CommentsSectionProps) {
  return (
    <div className="page-row">
      <PageCard>
        {loading ? (
          <div className="video-detail-state">{loadingText}</div>
        ) : error ? (
          <div className="video-detail-state">{error}</div>
        ) : groups.length === 0 ? (
          <div className="video-detail-state">{emptyText}</div>
        ) : (
          <div className="comments-groups">
            {groups.map((group) => (
              <CommentVideoGroup
                key={group.videoId}
                videoId={group.videoId}
                videoTitle={group.videoTitle}
                videoThumbnailUrl={group.videoThumbnailUrl}
                comments={group.comments}
              />
            ))}
            {footer}
          </div>
        )}
      </PageCard>
    </div>
  )
}

export type { CommentsSectionProps }
export default CommentsSection

import type { ReactNode } from 'react'
import './CommentsWordCloudCard.css'

type CommentsWordCloudCardProps = {
  imageUrl: string
  loading: boolean
  error: string | null
  controls?: ReactNode
}

function CommentsWordCloudCard({ imageUrl, loading, error, controls }: CommentsWordCloudCardProps) {
  return (
    <section className="comments-word-cloud-card">
      {controls ? <div className="comments-word-cloud-controls">{controls}</div> : null}
      {loading ? <div className="comments-word-cloud-state">Building word cloud...</div> : null}
      {error ? <div className="comments-word-cloud-state">{error}</div> : null}
      {!loading && !error ? (
        !imageUrl ? (
          <div className="comments-word-cloud-state">No terms available for current filtered comments.</div>
        ) : (
          <div className="comments-word-cloud-list">
            <img className="comments-word-cloud-image" src={imageUrl} alt="Word cloud generated from filtered comments" />
          </div>
        )
      ) : null}
    </section>
  )
}

export default CommentsWordCloudCard

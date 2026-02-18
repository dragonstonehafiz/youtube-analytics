import { MultiSelect } from '../ui'
import './CommentsWordCloudCard.css'

type CommentsWordCloudCardProps = {
  imageUrl: string
  loading: boolean
  error: string | null
  wordTypeOptions: Array<{ label: string; value: string }>
  selectedWordTypes: string[]
  onWordTypesChange: (next: string[]) => void
}

function CommentsWordCloudCard({
  imageUrl,
  loading,
  error,
  wordTypeOptions,
  selectedWordTypes,
  onWordTypesChange,
}: CommentsWordCloudCardProps) {
  return (
    <section className="comments-word-cloud-card">
      <label className="comments-word-cloud-controls">
        <span className="comments-word-cloud-control-label">Word types</span>
        <MultiSelect
          items={wordTypeOptions}
          selected={selectedWordTypes}
          onChange={onWordTypesChange}
          placeholder="Word types"
        />
      </label>
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

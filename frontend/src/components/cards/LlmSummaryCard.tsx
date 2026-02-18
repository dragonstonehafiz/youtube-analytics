import { ActionButton, Dropdown, MarkdownTextbox } from '../ui'
import './LlmSummaryCard.css'

type LlmSummaryCardProps = {
  loading: boolean
  error: string | null
  summary: string
  maxComments: string
  onMaxCommentsChange: (value: string) => void
  rankBy: 'recency' | 'like_count'
  onRankByChange: (value: 'recency' | 'like_count') => void
  onSummarize: () => void
  disabled?: boolean
}

function LlmSummaryCard({
  loading,
  error,
  summary,
  maxComments,
  onMaxCommentsChange,
  rankBy,
  onRankByChange,
  onSummarize,
  disabled = false,
}: LlmSummaryCardProps) {
  return (
    <section className="llm-summary-card">
      <div className="llm-summary-controls">
        <label className="llm-summary-control-field">
          <span className="llm-summary-control-label">
            Max comments
            <span className="llm-summary-help" title="Leave blank to default to 1000 comments.">
              ?
            </span>
          </span>
          <input
            className="llm-summary-limit-input"
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            step={1}
            placeholder="50"
            value={maxComments}
            onChange={(event) => {
              const raw = event.target.value
              if (!raw) {
                onMaxCommentsChange('')
                return
              }
              const parsed = Number(raw)
              if (!Number.isFinite(parsed)) {
                return
              }
              const clamped = Math.min(1000, Math.max(1, Math.floor(parsed)))
              onMaxCommentsChange(String(clamped))
            }}
          />
        </label>
        <label className="llm-summary-control-field">
          <span className="llm-summary-control-label">Rank by</span>
          <Dropdown
            value={rankBy}
            onChange={(value) => onRankByChange(value as 'recency' | 'like_count')}
            placeholder="Rank by"
            items={[
              { type: 'option' as const, label: 'Recency', value: 'recency' },
              { type: 'option' as const, label: 'Like count', value: 'like_count' },
            ]}
          />
        </label>
      </div>
      <ActionButton
        label={loading ? 'Summarizing...' : 'Summarize comments'}
        onClick={onSummarize}
        disabled={disabled || loading}
        variant="primary"
        className="llm-summary-button"
      />
      {error ? <div className="llm-summary-state llm-summary-state-error">{error}</div> : null}
      <MarkdownTextbox
        value={summary}
        placeholder={loading ? 'Generating summary...' : 'Click summarize to generate an overview.'}
        className="llm-summary-output"
      />
    </section>
  )
}

export default LlmSummaryCard

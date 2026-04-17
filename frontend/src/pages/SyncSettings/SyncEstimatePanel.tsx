import { RatioBar } from '@components/charts'
import type { ApiCallRow } from './utils'

type Props = {
  loading: boolean
  error: string | null
  apiLabel: string
  apiCallRow: ApiCallRow
}

function SyncEstimatePanel({ loading, error, apiLabel, apiCallRow }: Props) {
  return (
    <div className="sync-estimate-section">
      {loading ? (
        <div className="sync-estimate-meta">Loading...</div>
      ) : error ? (
        <div className="sync-estimate-meta">{error}</div>
      ) : (
        <div className="sync-estimate-bar-row">
          <div className="sync-estimate-bar-header">
            <span className="sync-estimate-api-label">{apiLabel}</span>
            <span>{`${apiCallRow.total.toLocaleString()} / ${apiCallRow.max.toLocaleString()}`}</span>
          </div>
          <RatioBar length="100%" ratio={100} color="#94a3b8" segments={apiCallRow.segments} />
          <div className="sync-estimate-legend">
            {apiCallRow.legendItems.map((item) => (
              <div key={item.key} className="sync-estimate-legend-item">
                <span className="sync-estimate-legend-dot" style={{ backgroundColor: item.color }} />
                <span className="sync-estimate-legend-label">{item.label}</span>
                <span className="sync-estimate-legend-value">{item.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default SyncEstimatePanel

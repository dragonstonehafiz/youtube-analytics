import { MetricChartCard, type Granularity, type MetricItem } from '../../components/charts'
import { PageCard } from '../../components/cards'

type Props = {
  loading: boolean
  error: string | null
  granularity: Granularity
  data: MetricItem[]
}

function VideoDetailMetricPanel({ loading, error, granularity, data }: Props) {
  return (
    <div className="page-row">
      <PageCard>
        {loading ? (
          <div className="video-detail-state">Loading video analytics...</div>
        ) : error ? (
          <div className="video-detail-state">{error}</div>
        ) : (
          <MetricChartCard data={data} granularity={granularity} />
        )}
      </PageCard>
    </div>
  )
}

export default VideoDetailMetricPanel

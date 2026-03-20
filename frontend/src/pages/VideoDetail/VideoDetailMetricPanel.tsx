import { MetricChartCard, type Granularity, type MetricItem } from '@components/charts'
import { PageCard } from '@components/ui'

type Props = {
  loading: boolean
  error: string | null
  granularity: Granularity
  data: MetricItem[]
}

function VideoDetailMetricPanel({ loading, error, granularity, data }: Props) {
  if (error) {
    return (
      <div className="page-row">
        <PageCard>
          <div className="video-detail-state">{error}</div>
        </PageCard>
      </div>
    )
  }

  return (
    <div className="page-row">
      <PageCard>
        <MetricChartCard data={data} granularity={granularity} />
      </PageCard>
    </div>
  )
}

export default VideoDetailMetricPanel

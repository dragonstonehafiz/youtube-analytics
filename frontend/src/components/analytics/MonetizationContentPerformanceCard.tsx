type MonetizationContentType = 'video' | 'short'

type MonetizationTopItem = {
  video_id: string
  title: string
  thumbnail_url: string
  revenue: number
}

type MonetizationPerformance = {
  views: number
  estimated_revenue: number
  rpm: number
  items: MonetizationTopItem[]
}

type MonetizationContentPerformanceCardProps = {
  contentType: MonetizationContentType
  onContentTypeChange: (value: MonetizationContentType) => void
  performance: Record<MonetizationContentType, MonetizationPerformance>
  itemCount?: number
  onOpenVideo: (videoId: string) => void
}

function formatCurrency(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatViews(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function MonetizationContentPerformanceCard({
  contentType,
  onContentTypeChange,
  performance,
  itemCount = 5,
  onOpenVideo,
}: MonetizationContentPerformanceCardProps) {
  const active = performance[contentType]
  const visibleItems = active.items.slice(0, itemCount)
  const revenueValues = visibleItems.map((entry) => entry.revenue)
  const maxRevenue = revenueValues.length > 0 ? Math.max(...revenueValues) : 0

  return (
    <div className="analytics-monetization-card">
      <div className="analytics-monetization-title">Content performance</div>
      <div className="analytics-content-toggle">
        <button
          type="button"
          className={contentType === 'video' ? 'analytics-source-tab active' : 'analytics-source-tab'}
          onClick={() => onContentTypeChange('video')}
        >
          Videos
        </button>
        <button
          type="button"
          className={contentType === 'short' ? 'analytics-source-tab active' : 'analytics-source-tab'}
          onClick={() => onContentTypeChange('short')}
        >
          Shorts
        </button>
      </div>
      <div className="analytics-content-kpis">
        <div>
          <strong>${formatCurrency(active.estimated_revenue)}</strong>
          <span>Estimated revenue</span>
        </div>
        <div>
          <strong>{formatViews(active.views)}</strong>
          <span>Views</span>
        </div>
        <div>
          <strong>${formatCurrency(active.rpm)}</strong>
          <span>Revenue per 1K views (RPM)</span>
        </div>
      </div>
      <div className="analytics-content-top-list">
        {visibleItems.map((item) => {
          const width = maxRevenue > 0 ? `${Math.max(6, (item.revenue / maxRevenue) * 100)}%` : '0%'
          return (
            <div key={item.video_id} className="analytics-content-top-row">
              <div className="analytics-content-video">
                {item.thumbnail_url ? (
                  <img src={item.thumbnail_url} alt={item.title} />
                ) : (
                  <div className="analytics-content-video-fallback" />
                )}
                <button
                  type="button"
                  className="analytics-content-video-title"
                  onClick={() => onOpenVideo(item.video_id)}
                >
                  {item.title}
                </button>
              </div>
              <div className="analytics-content-revenue">
                <span className="analytics-content-revenue-bar-wrap">
                  <span className="analytics-content-revenue-bar" style={{ width }} />
                </span>
                <strong>${formatCurrency(item.revenue)}</strong>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default MonetizationContentPerformanceCard

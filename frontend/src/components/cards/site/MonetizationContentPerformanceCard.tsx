import { useEffect, useRef, useState } from 'react'
import { useHideMonetaryValues, useHideVideoTitles, useHideVideoThumbnails } from '../../../hooks/usePrivacyMode'
import type { MonetizationContentType, MonetizationPerformance } from '../../../utils/monetization'
export type { MonetizationContentType, MonetizationTopItem, MonetizationPerformance } from '../../../utils/monetization'

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
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [cardWidth, setCardWidth] = useState(0)
  const hideMonetaryValues = useHideMonetaryValues()
  const hideVideoTitles = useHideVideoTitles()
  const hideVideoThumbnails = useHideVideoThumbnails()
  const active = performance[contentType]
  const visibleItems = active.items.slice(0, itemCount)
  const revenueValues = visibleItems.map((entry) => entry.revenue)
  const maxRevenue = revenueValues.length > 0 ? Math.max(...revenueValues) : 0
  const COMPACT_WIDTH = 420
  const MIN_VISIBLE_RATIO = 0.08
  const isCompact = cardWidth > 0 && cardWidth <= COMPACT_WIDTH
  const kpis = [
    { key: 'estimated_revenue', label: 'Estimated revenue', value: hideMonetaryValues ? '••••••' : `$${formatCurrency(active.estimated_revenue)}` },
    { key: 'views', label: 'Views', value: formatViews(active.views) },
    { key: 'rpm', label: 'Revenue per 1K views (RPM)', value: hideMonetaryValues ? '••••••' : `$${formatCurrency(active.rpm)}` },
  ]

  useEffect(() => {
    if (!cardRef.current) {
      return
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCardWidth(Math.floor(entry.contentRect.width))
      }
    })
    observer.observe(cardRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div className={isCompact ? 'analytics-monetization-card compact' : 'analytics-monetization-card'} ref={cardRef}>
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
      <div className={isCompact ? 'analytics-content-kpis compact' : 'analytics-content-kpis'}>
        {kpis.map((kpi) => (
          <div key={kpi.key}>
            {isCompact ? (
              <>
                <span className="analytics-content-kpi-label">{kpi.label}</span>
                <strong>{kpi.value}</strong>
              </>
            ) : (
              <>
                <strong>{kpi.value}</strong>
                <span>{kpi.label}</span>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="analytics-content-top-list">
        {visibleItems.map((item) => {
          const ratio = maxRevenue > 0 ? item.revenue / maxRevenue : 0
          const showBar = !isCompact && ratio >= MIN_VISIBLE_RATIO
          const width = `${Math.max(0, ratio * 100)}%`
          return (
            <div key={item.video_id} className={showBar ? 'analytics-content-top-row' : 'analytics-content-top-row compact'}>
              <div className="analytics-content-video">
                {hideVideoThumbnails ? (
                  <div className="analytics-content-video-fallback" />
                ) : item.thumbnail_url ? (
                  <img src={item.thumbnail_url} alt={item.title} />
                ) : (
                  <div className="analytics-content-video-fallback" />
                )}
                <button
                  type="button"
                  className="analytics-content-video-title"
                  onClick={() => onOpenVideo(item.video_id)}
                  title={hideVideoTitles ? '••••••' : item.title}
                >
                  {hideVideoTitles ? '••••••' : item.title}
                </button>
              </div>
              <div className={showBar ? 'analytics-content-revenue' : 'analytics-content-revenue compact'}>
                {showBar ? (
                  <span className="analytics-content-revenue-bar-wrap">
                    <span className="analytics-content-revenue-bar" style={{ width }} />
                  </span>
                ) : null}
                <strong>{hideMonetaryValues ? '••••••' : `$${formatCurrency(item.revenue)}`}</strong>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default MonetizationContentPerformanceCard

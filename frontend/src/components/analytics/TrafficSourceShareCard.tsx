import { useMemo, useState } from 'react'
import { DonutChart, RatioBar, type DonutSegmentResolved } from '../ui'
import { formatWholeNumber } from '../../utils/number'
import './TrafficSourceShareCard.css'

type TrafficSourceShareItem = {
  key: string
  label: string
  views: number
}

type TrafficSourceShareCardProps = {
  items: TrafficSourceShareItem[]
}

const PIE_COLORS = ['#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#ef4444', '#14b8a6', '#eab308']

function TrafficSourceShareCard({ items }: TrafficSourceShareCardProps) {
  const [hoveredSegment, setHoveredSegment] = useState<DonutSegmentResolved | null>(null)
  const totalViews = items.reduce((sum, item) => sum + item.views, 0)
  const segments = useMemo(
    () =>
      items.map((item, index) => ({
        key: item.key,
        label: item.label,
        value: item.views,
        color: PIE_COLORS[index % PIE_COLORS.length],
      })),
    [items]
  )

  return (
    <div className="traffic-share-card">
      <div className="traffic-share-chart-column">
        <div className="traffic-share-chart-wrap">
        <DonutChart
          segments={segments}
          centerLabel="Total views"
          centerValue={formatWholeNumber(totalViews)}
          ariaLabel="Traffic source share by views"
          size={220}
          strokeWidth={24}
          onHoverChange={setHoveredSegment}
        />
        </div>
        {segments.length === 0 ? (
          <div className="traffic-share-hover">No traffic-source data available.</div>
        ) : (
          <div className="traffic-share-hover">
            {hoveredSegment
              ? `${hoveredSegment.label}: ${formatWholeNumber(hoveredSegment.value)} (${hoveredSegment.percent.toFixed(1)}%)`
              : 'Hover over a slice to see views'}
          </div>
        )}
      </div>
      <div className="traffic-share-legend">
        {items.map((item, index) => {
          const percent = totalViews > 0 ? (item.views / totalViews) * 100 : 0
          const color = PIE_COLORS[index % PIE_COLORS.length]
          return (
            <div key={item.key} className="traffic-share-row">
              <span className="traffic-share-label">
                {item.label}
              </span>
              <div className="traffic-share-bar-wrap">
                <RatioBar length="100%" color={color} ratio={percent} />
              </div>
              <span className="traffic-share-value">
                {percent.toFixed(1)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export type { TrafficSourceShareItem }
export default TrafficSourceShareCard

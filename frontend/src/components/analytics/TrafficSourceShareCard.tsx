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
  const totalViews = items.reduce((sum, item) => sum + item.views, 0)
  const radius = 86
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="traffic-share-card">
      <div className="traffic-share-chart-wrap">
        <svg width="220" height="220" viewBox="0 0 220 220" className="traffic-share-chart" role="img" aria-label="Traffic source share by views">
          <circle cx="110" cy="110" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="24" />
          {items.map((item, index) => {
            const value = totalViews > 0 ? item.views / totalViews : 0
            const segment = value * circumference
            const strokeDasharray = `${segment} ${Math.max(circumference - segment, 0)}`
            const strokeDashoffset = -offset
            offset += segment
            return (
              <circle
                key={item.key}
                cx="110"
                cy="110"
                r={radius}
                fill="none"
                stroke={PIE_COLORS[index % PIE_COLORS.length]}
                strokeWidth="24"
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                transform="rotate(-90 110 110)"
              />
            )
          })}
        </svg>
        <div className="traffic-share-total">
          <span>Total views</span>
          <strong>{formatWholeNumber(totalViews)}</strong>
        </div>
      </div>
      <div className="traffic-share-legend">
        {items.map((item, index) => {
          const percent = totalViews > 0 ? (item.views / totalViews) * 100 : 0
          return (
            <div key={item.key} className="traffic-share-row">
              <span className="traffic-share-label">
                <span
                  className="traffic-share-dot"
                  style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                  aria-hidden="true"
                />
                {item.label}
              </span>
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

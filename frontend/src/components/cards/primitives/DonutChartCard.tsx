import { useEffect, useRef, useState } from 'react'
import { DonutChart, RatioBar, type DonutSegmentResolved } from '../../charts'
import './DonutChartCard.css'

type DonutChartCardSegment = {
  key: string
  label: string
  value: number
  color: string
  displayValue: string
}

type DonutChartCardProps = {
  segments: DonutChartCardSegment[]
  centerLabel: string
  centerValue: string
  ariaLabel: string
  size?: number
}

function DonutChartCard({ segments, centerLabel, centerValue, ariaLabel, size = 220 }: DonutChartCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [cardWidth, setCardWidth] = useState(0)
  const [hoveredSegment, setHoveredSegment] = useState<DonutSegmentResolved | null>(null)
  const isCompact = cardWidth > 0 && cardWidth <= 420
  const total = segments.reduce((sum, s) => sum + s.value, 0)

  useEffect(() => {
    if (!cardRef.current) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCardWidth(Math.floor(entry.contentRect.width))
      }
    })
    observer.observe(cardRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div className={isCompact ? 'donut-chart-card compact' : 'donut-chart-card'} ref={cardRef}>
        <div className="donut-chart-card-chart-column">
          <div className="donut-chart-card-chart-wrap">
            <DonutChart
              segments={segments}
              centerLabel={centerLabel}
              centerValue={centerValue}
              ariaLabel={ariaLabel}
              size={size}
              onHoverChange={setHoveredSegment}
            />
          </div>
          <div className="donut-chart-card-hover">
            {hoveredSegment
              ? `${hoveredSegment.label}: ${hoveredSegment.value.toLocaleString()} (${hoveredSegment.percent.toFixed(1)}%)`
              : 'Hover over a slice to see views'}
          </div>
        </div>
        {!isCompact ? (
          <div className="donut-chart-card-legend">
            {segments.map((segment) => {
              const percent = total > 0 ? (segment.value / total) * 100 : 0
              return (
                <div key={segment.key} className="donut-chart-card-row">
                  <span className="donut-chart-card-label">{segment.label}</span>
                  <div className="donut-chart-card-bar-wrap">
                    <RatioBar length="100%" color={segment.color} ratio={percent} />
                  </div>
                  <span className="donut-chart-card-value">{segment.displayValue}</span>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    )
  }

export type { DonutChartCardSegment }
export default DonutChartCard

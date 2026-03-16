import { useMemo, useState } from 'react'
import './DonutChart.css'

type DonutSegmentInput = {
  key: string
  label: string
  value: number
  color?: string
}

type DonutSegmentResolved = {
  key: string
  label: string
  value: number
  color: string
  percent: number
  start: number
}

type DonutChartProps = {
  segments: DonutSegmentInput[]
  centerLabel: string
  centerValue: string
  ariaLabel: string
  size?: number
  strokeWidth?: number
  onHoverChange?: (segment: DonutSegmentResolved | null) => void
}

const DEFAULT_COLORS = ['#0ea5e9', '#14b8a6', '#f59e0b', '#f97316', '#84cc16', '#22c55e', '#6366f1', '#e11d48']

function DonutChart({
  segments,
  centerLabel,
  centerValue,
  ariaLabel,
  size = 220,
  strokeWidth = 24,
  onHoverChange,
}: DonutChartProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const radius = Math.max(8, (size - strokeWidth) / 2)
  const center = size / 2
  const circumference = 2 * Math.PI * radius

  const resolvedSegments = useMemo<DonutSegmentResolved[]>(() => {
    const filtered = segments.filter((segment) => segment.value > 0)
    const total = filtered.reduce((sum, segment) => sum + segment.value, 0)
    // Map segments with start positions computed from cumulative percentages
    const result: DonutSegmentResolved[] = []
    let cumulativePercent = 0
    filtered.forEach((segment, index) => {
      const percent = total > 0 ? (segment.value / total) * 100 : 0
      result.push({
        key: segment.key,
        label: segment.label,
        value: segment.value,
        color: segment.color ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length],
        percent,
        start: cumulativePercent,
      })
      cumulativePercent += percent
    })
    return result
  }, [segments])

  return (
    <div className="donut-chart-wrap">
      <svg className="donut-chart-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel}>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
        {resolvedSegments.map((segment) => {
          const segmentLength = (segment.percent / 100) * circumference
          const segmentOffset = -((segment.start / 100) * circumference)
          return (
            <circle
              key={segment.key}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${segmentLength} ${circumference}`}
              strokeDashoffset={segmentOffset}
              transform={`rotate(-90 ${center} ${center})`}
              className={hoveredKey && hoveredKey !== segment.key ? 'donut-segment dimmed' : 'donut-segment'}
              onMouseEnter={() => {
                setHoveredKey(segment.key)
                onHoverChange?.(segment)
              }}
              onMouseLeave={() => {
                setHoveredKey(null)
                onHoverChange?.(null)
              }}
            />
          )
        })}
      </svg>
      <div className="donut-chart-center">
        <div className="donut-chart-center-label">{centerLabel}</div>
        <div className="donut-chart-center-value">{centerValue}</div>
      </div>
    </div>
  )
}

export type { DonutSegmentInput, DonutSegmentResolved }
export default DonutChart

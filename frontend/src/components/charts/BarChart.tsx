import { useEffect, useMemo, useRef, useState } from 'react'
import { Tooltip } from '../ui'
import './BarChart.css'

export type BarChartBarInfo = {
  label: string
  rangeLabel: string
  count: number
  totalViews: number
  min: number
  max: number
  index: number
  dataIndices: number[]
}

type BarChartProps = {
  data: number[]
  color?: string
  width?: number
  height?: number
  fillWidth?: boolean
  xAxisLabel?: string
  yAxisLabel?: string
  ariaLabel?: string
  onBarClick?: (bar: BarChartBarInfo, x: number, y: number) => void
  onBarMouseEnter?: (bar: BarChartBarInfo, event: React.MouseEvent<SVGRectElement>) => void
  onBarMouseLeave?: () => void
}

function formatValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`
  return value.toLocaleString()
}

function percentileValue(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const index = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

function BarChart({
  data,
  color = '#0ea5e9',
  width: widthProp = 600,
  height = 300,
  fillWidth = false,
  xAxisLabel,
  yAxisLabel = 'Total Views',
  ariaLabel = 'Bar chart',
  onBarClick,
  onBarMouseEnter,
  onBarMouseLeave,
}: BarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [containerWidth, setContainerWidth] = useState(widthProp)
  const [hoverBar, setHoverBar] = useState<{ bar: BarChartBarInfo; x: number; y: number } | null>(null)

  useEffect(() => {
    if (!fillWidth) return
    const container = containerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect()
      setContainerWidth(Math.max(300, rect.width))
    })

    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [fillWidth])

  const width = fillWidth ? containerWidth : widthProp
  const paddingBottom = xAxisLabel ? 70 : 60
  const padding = { top: 20, right: 20, bottom: paddingBottom, left: 70 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const bars = useMemo(() => {
    if (data.length === 0) return []

    const sorted = [...data].sort((a, b) => a - b)
    const min = sorted[0]
    const max = sorted[sorted.length - 1]

    const percentiles = [50, 70, 80, 90, 100].map((p) => ({
      p,
      value: percentileValue(sorted, p),
    }))

    const thresholds = [
      { label: '0–50%', min, max: percentiles[0].value },
      { label: '50–70%', min: percentiles[0].value, max: percentiles[1].value },
      { label: '70–80%', min: percentiles[1].value, max: percentiles[2].value },
      { label: '80–90%', min: percentiles[2].value, max: percentiles[3].value },
      { label: '90–100%', min: percentiles[3].value, max },
    ]

    return thresholds.map((t, index) => {
      const dataIndices: number[] = []
      let count = 0
      let totalViews = 0

      data.forEach((value, idx) => {
        let inRange = false
        if (index === 0) {
          inRange = value <= t.max
        } else if (index === thresholds.length - 1) {
          inRange = value > t.min
        } else {
          inRange = value > t.min && value <= t.max
        }

        if (inRange) {
          dataIndices.push(idx)
          count++
          totalViews += value
        }
      })

      return {
        label: t.label,
        rangeLabel: `${formatValue(Math.round(t.min))} – ${formatValue(Math.round(t.max))}`,
        count,
        totalViews,
        min: t.min,
        max: t.max,
        index,
        dataIndices,
      } as BarChartBarInfo
    })
  }, [data])

  if (bars.length === 0) {
    return (
      <div ref={containerRef} className="bar-chart-container">
        <div className="bar-chart-empty">No data available</div>
      </div>
    )
  }

  const maxViews = Math.max(...bars.map((b) => b.totalViews))
  const barWidth = chartWidth / bars.length
  const barPadding = barWidth * 0.2

  return (
    <div ref={containerRef} className="bar-chart-container">
      <svg
        ref={svgRef}
        className="bar-chart-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
      >
        {/* Y-axis label */}
        <text x={padding.left} y={padding.top - 8} fontSize="12" fontWeight="600" fill="#475569" textAnchor="middle" dominantBaseline="auto">
          {yAxisLabel}
        </text>

        {/* Y-axis */}
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="1" />

        {/* X-axis */}
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="1" />

        {/* X-axis label */}
        {xAxisLabel && (
          <text x={width / 2} y={height - 8} fontSize="12" fontWeight="600" fill="#475569" textAnchor="middle">
            {xAxisLabel}
          </text>
        )}

        {/* Y-axis grid lines and tick labels */}
        {Array.from({ length: 5 }).map((_, i) => {
          const ratio = i / 4
          const y = height - padding.bottom - ratio * chartHeight
          const value = Math.round(maxViews * ratio)
          return (
            <g key={`grid-${i}`}>
              <line x1={padding.left - 5} y1={y} x2={padding.left} y2={y} stroke="#cbd5e1" strokeWidth="1" />
              <text x={padding.left - 10} y={y + 4} fontSize="11" fill="#94a3b8" textAnchor="end">
                {formatValue(value)}
              </text>
            </g>
          )
        })}

        {/* Bars */}
        {bars.map((bar, index) => {
          const barHeight = maxViews > 0 ? (bar.totalViews / maxViews) * chartHeight : 0
          const x = padding.left + index * barWidth + barPadding / 2
          const y = height - padding.bottom - barHeight
          const barW = barWidth - barPadding

          return (
            <g key={`bar-${index}`}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barHeight}
                fill={color}
                opacity="0.8"
                className="bar-chart-bar"
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const cx = rect.left + rect.width / 2
                  const cy = rect.top
                  setHoverBar({ bar, x: cx, y: cy })
                  onBarMouseEnter?.(bar, e as React.MouseEvent<SVGRectElement>)
                }}
                onMouseLeave={() => {
                  setHoverBar(null)
                  onBarMouseLeave?.()
                }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  onBarClick?.(bar, rect.left + rect.width / 2, rect.top)
                }}
              />
              {/* Percentile label */}
              <text x={x + barW / 2} y={height - padding.bottom + 16} fontSize="11" fill="#64748b" textAnchor="middle" className="bar-chart-label">
                {bar.label}
              </text>
              {/* Range label */}
              <text x={x + barW / 2} y={height - padding.bottom + 30} fontSize="10" fill="#94a3b8" textAnchor="middle" className="bar-chart-label">
                {bar.rangeLabel}
              </text>
            </g>
          )
        })}
      </svg>

      {hoverBar && (
        <Tooltip
          x={hoverBar.x}
          y={hoverBar.y}
          content={
            <>
              <strong>{hoverBar.bar.label}</strong>
              <br />
              {formatValue(hoverBar.bar.totalViews)} total views
              <br />
              {hoverBar.bar.count.toLocaleString()} {hoverBar.bar.count === 1 ? 'video' : 'videos'}
            </>
          }
        />
      )}
    </div>
  )
}

export default BarChart

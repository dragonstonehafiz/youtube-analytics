import { useMemo, useRef, useState } from 'react'
import { Tooltip } from '../ui'
import './HistogramChart.css'

type HistogramChartProps = {
  data: number[]
  color?: string
  binCount?: number
  binSize?: number
  width?: number
  height?: number
  xAxisLabel?: string
  yAxisLabel?: string
  ariaLabel?: string
}

function HistogramChart({
  data,
  color = '#0ea5e9',
  binCount,
  binSize,
  width = 600,
  height = 300,
  xAxisLabel = 'Views',
  yAxisLabel = 'Count',
  ariaLabel = 'Histogram chart',
}: HistogramChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverBin, setHoverBin] = useState<{ index: number; min: number; max: number; count: number; x: number; y: number } | null>(null)
  const padding = { top: 20, right: 20, bottom: 50, left: 70 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const bins = useMemo(() => {
    if (data.length === 0) return []

    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min

    // Determine bin configuration
    let finalBinSize: number
    let finalBinCount: number

    if (binSize !== undefined) {
      finalBinSize = binSize
      finalBinCount = Math.ceil(range / binSize) + 1
    } else {
      finalBinCount = binCount ?? 10
      finalBinSize = range > 0 ? range / finalBinCount : 1
    }

    // Create exactly finalBinCount bins
    const binsArray = Array(finalBinCount)
      .fill(null)
      .map((_, i) => ({
        min: min + i * finalBinSize,
        max: min + (i + 1) * finalBinSize,
        count: 0,
      }))

    // Assign data points to bins
    data.forEach((value) => {
      if (range === 0) {
        // All values are the same, put them in first bin
        binsArray[0].count++
      } else {
        let binIndex = Math.floor((value - min) / finalBinSize)
        // Handle edge case where value equals max
        if (binIndex >= binsArray.length) {
          binIndex = binsArray.length - 1
        }
        if (binIndex >= 0) {
          binsArray[binIndex].count++
        }
      }
    })

    return binsArray
  }, [data, binCount, binSize])

  if (bins.length === 0) {
    return (
      <div className="histogram-chart-empty">
        <div>No data available</div>
      </div>
    )
  }

  const maxCount = Math.max(...bins.map((bin) => bin.count))
  const barWidth = chartWidth / bins.length
  const barPadding = barWidth * 0.1

  return (
    <div className="histogram-chart-container">
      <svg
        ref={svgRef}
        className="histogram-chart-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
      >
        {/* Y-axis label */}
        <text
          x={padding.left}
          y={padding.top - 8}
          fontSize="12"
          fontWeight="600"
          fill="#475569"
          textAnchor="middle"
          dominantBaseline="auto"
        >
          {yAxisLabel}
        </text>

        {/* Y-axis */}
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="1" />

        {/* X-axis */}
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="1" />

        {/* X-axis label */}
        <text x={width / 2} y={height - 10} fontSize="12" fontWeight="600" fill="#475569" textAnchor="middle">
          {xAxisLabel}
        </text>

        {/* Grid lines and tick labels */}
        {Array.from({ length: 5 }).map((_, i) => {
          const ratio = i / 4
          const y = height - padding.bottom - ratio * chartHeight
          const value = Math.round(maxCount * ratio)
          return (
            <g key={`grid-${i}`}>
              <line x1={padding.left - 5} y1={y} x2={padding.left} y2={y} stroke="#cbd5e1" strokeWidth="1" />
              <text x={padding.left - 10} y={y + 4} fontSize="11" fill="#94a3b8" textAnchor="end">
                {value}
              </text>
            </g>
          )
        })}

        {/* Bars */}
        {bins.map((bin, index) => {
          const barHeight = (bin.count / maxCount) * chartHeight
          const x = padding.left + index * barWidth + barPadding / 2
          const y = height - padding.bottom - barHeight

          return (
            <g key={`bar-${index}`}>
              <rect
                x={x}
                y={y}
                width={barWidth - barPadding}
                height={barHeight}
                fill={color}
                opacity="0.8"
                className="histogram-bar"
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setHoverBin({
                    index,
                    min: bin.min,
                    max: bin.max,
                    count: bin.count,
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                  })
                }}
                onMouseLeave={() => setHoverBin(null)}
              />
              {/* Bin label */}
              <text
                x={x + (barWidth - barPadding) / 2}
                y={height - padding.bottom + 20}
                fontSize="10"
                fill="#64748b"
                textAnchor="middle"
                className="histogram-label"
              >
                {Math.round(bin.min / 1000)}k
              </text>
            </g>
          )
        })}

      </svg>
      {hoverBin && (
        <Tooltip
          x={hoverBin.x}
          y={hoverBin.y}
          content={
            <>
              {Math.round(hoverBin.min).toLocaleString()} - {Math.round(hoverBin.max).toLocaleString()}
              <br />
              {hoverBin.count.toLocaleString()} {hoverBin.count === 1 ? 'video' : 'videos'}
            </>
          }
        />
      )}
    </div>
  )
}

export default HistogramChart

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatSecondsAsTime } from '../../utils/number'
import './HistogramChart.css'

type HistogramChartProps = {
  data: number[]
  color?: string
  binCount?: number
  binSize?: number
  width?: number
  height?: number
  fillWidth?: boolean
  xAxisLabel?: string
  yAxisLabel?: string
  ariaLabel?: string
  onBinMouseEnter?: (binIndex: number, dataIndices: number[], event: React.MouseEvent<SVGRectElement>) => void
  onBinMouseExit?: () => void
}

function HistogramChart({
  data,
  color = '#0ea5e9',
  binCount,
  binSize,
  width: widthProp = 600,
  height = 300,
  fillWidth = false,
  xAxisLabel = 'Views',
  yAxisLabel = 'Count',
  ariaLabel = 'Histogram chart',
  onBinMouseEnter,
  onBinMouseExit,
}: HistogramChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [containerWidth, setContainerWidth] = useState(widthProp)

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
  const padding = { top: 20, right: 20, bottom: 50, left: 70 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const bins = useMemo(() => {
    if (data.length === 0) return []

    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min

    let finalBinSize: number
    let finalBinCount: number

    if (binSize !== undefined) {
      finalBinSize = binSize
      finalBinCount = Math.ceil(range / binSize) + 1
    } else {
      finalBinCount = binCount ?? 10
      finalBinSize = range > 0 ? range / finalBinCount : 1
    }

    const binsArray = Array(finalBinCount)
      .fill(null)
      .map((_, i) => ({
        min: min + i * finalBinSize,
        max: min + (i + 1) * finalBinSize,
        count: 0,
        dataIndices: [] as number[],
      }))

    data.forEach((value, index) => {
      if (range === 0) {
        binsArray[0].count++
        binsArray[0].dataIndices.push(index)
      } else {
        let binIndex = Math.floor((value - min) / finalBinSize)
        if (binIndex >= binsArray.length) {
          binIndex = binsArray.length - 1
        }
        if (binIndex >= 0) {
          binsArray[binIndex].count++
          binsArray[binIndex].dataIndices.push(index)
        }
      }
    })

    return binsArray
  }, [data, binCount, binSize])

  if (bins.length === 0) {
    return (
      <div ref={containerRef} className="histogram-chart-container">
        <div className="histogram-chart-empty">No data available</div>
      </div>
    )
  }

  const maxCount = Math.max(...bins.map((bin) => bin.count))
  const barWidth = chartWidth / bins.length
  const barPadding = barWidth * 0.1

  return (
    <div ref={containerRef} className="histogram-chart-container">
      <svg
        ref={svgRef}
        className="histogram-chart-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
      >
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

        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="1" />
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="1" />

        <text x={width / 2} y={height - 10} fontSize="12" fontWeight="600" fill="#475569" textAnchor="middle">
          {xAxisLabel}
        </text>

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
                  onBinMouseEnter?.(index, bin.dataIndices, e as React.MouseEvent<SVGRectElement>)
                }}
                onMouseLeave={() => {
                  onBinMouseExit?.()
                }}
              />
              <text
                x={x + (barWidth - barPadding) / 2}
                y={height - padding.bottom + 20}
                fontSize="10"
                fill="#64748b"
                textAnchor="middle"
                className="histogram-label"
              >
                {formatSecondsAsTime(bin.min * 60)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default HistogramChart

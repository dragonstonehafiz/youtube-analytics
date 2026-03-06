import { useEffect, useRef, useState } from 'react'

export type ScatterPoint = {
  x: number
  y: number
  color: string
}

type ScatterChartProps = {
  points: ScatterPoint[]
  width?: number
  height?: number
  fillWidth?: boolean
  xAxisLabel?: string
  yAxisLabel?: string
  ariaLabel?: string
  medianX?: number
  medianY?: number
  logX?: boolean
  logY?: boolean
  formatX?: (value: number) => string
  formatY?: (value: number) => string
  onPointMouseEnter?: (index: number, event: React.MouseEvent<SVGCircleElement>) => void
  onPointMouseLeave?: (index: number) => void
}

function defaultFormat(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`
  return value.toLocaleString()
}

function logTicks(domainMin: number, domainMax: number): number[] {
  const safeMin = Math.max(1, domainMin)
  const safeMax = Math.max(1, domainMax)
  const expMin = Math.floor(Math.log10(safeMin))
  const expMax = Math.ceil(Math.log10(safeMax))
  const ticks: number[] = []
  for (let exp = expMin; exp <= expMax; exp++) {
    const t = Math.pow(10, exp)
    if (t >= safeMin && t <= safeMax) ticks.push(t)
  }
  return ticks.length > 0 ? ticks : [safeMin, safeMax]
}

function ScatterChart({
  points,
  width: widthProp = 600,
  height = 400,
  fillWidth = false,
  xAxisLabel,
  yAxisLabel,
  ariaLabel = 'Scatter chart',
  medianX,
  medianY,
  logX = false,
  logY = false,
  formatX = defaultFormat,
  formatY = defaultFormat,
  onPointMouseEnter,
  onPointMouseLeave,
}: ScatterChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
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
  const paddingBottom = xAxisLabel ? 60 : 44
  const paddingLeft = yAxisLabel ? 72 : 56
  const padding = { top: 20, right: 20, bottom: paddingBottom, left: paddingLeft }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  if (points.length === 0) {
    return (
      <div ref={containerRef} style={{ width: '100%', height }}>
        <svg width={width} height={height} style={{ display: 'block' }} role="img" aria-label={ariaLabel} />
      </div>
    )
  }

  const xValues = points.map((p) => p.x)
  const yValues = points.map((p) => p.y)
  const xMin = Math.min(...xValues)
  const xMax = Math.max(...xValues)
  const yMin = Math.min(...yValues)
  const yMax = Math.max(...yValues)

  // Linear domain with 5% padding
  const xRange = xMax - xMin || 1
  const yRange = yMax - yMin || 1
  const xDomainMin = logX ? Math.max(1, xMin) : xMin - xRange * 0.05
  const xDomainMax = logX ? xMax : xMax + xRange * 0.05
  const yDomainMin = logY ? Math.max(1, yMin) : yMin - yRange * 0.05
  const yDomainMax = logY ? yMax : yMax + yRange * 0.05

  // Log helpers
  const logXMin = logX ? Math.log10(Math.max(1, xDomainMin)) : 0
  const logXMax = logX ? Math.log10(Math.max(1, xDomainMax)) : 1
  const logYMin = logY ? Math.log10(Math.max(1, yDomainMin)) : 0
  const logYMax = logY ? Math.log10(Math.max(1, yDomainMax)) : 1

  const scaleX = (value: number) => {
    if (logX) {
      const t = (Math.log10(Math.max(1, value)) - logXMin) / (logXMax - logXMin)
      return padding.left + t * chartWidth
    }
    return padding.left + ((value - xDomainMin) / (xDomainMax - xDomainMin)) * chartWidth
  }
  const scaleY = (value: number) => {
    if (logY) {
      const t = (Math.log10(Math.max(1, value)) - logYMin) / (logYMax - logYMin)
      return padding.top + chartHeight - t * chartHeight
    }
    return padding.top + chartHeight - ((value - yDomainMin) / (yDomainMax - yDomainMin)) * chartHeight
  }

  const xTicks = logX
    ? logTicks(xDomainMin, xDomainMax)
    : Array.from({ length: 5 }, (_, i) => xDomainMin + (i / 4) * (xDomainMax - xDomainMin))
  const yTicks = logY
    ? logTicks(yDomainMin, yDomainMax)
    : Array.from({ length: 5 }, (_, i) => yDomainMin + (i / 4) * (yDomainMax - yDomainMin))

  return (
    <div ref={containerRef} style={{ width: '100%', height }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block' }}
        role="img"
        aria-label={ariaLabel}
      >
        {/* Grid lines */}
        {yTicks.map((value, i) => {
          const y = scaleY(value)
          return (
            <g key={`ygrid-${i}`}>
              <line x1={padding.left} y1={y} x2={padding.left + chartWidth} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text x={padding.left - 8} y={y + 4} fontSize="11" fill="#94a3b8" textAnchor="end">
                {formatY(Math.round(value))}
              </text>
            </g>
          )
        })}
        {xTicks.map((value, i) => {
          const x = scaleX(value)
          return (
            <g key={`xgrid-${i}`}>
              <line x1={x} y1={padding.top} x2={x} y2={padding.top + chartHeight} stroke="#e2e8f0" strokeWidth="1" />
              <text x={x} y={padding.top + chartHeight + 16} fontSize="11" fill="#94a3b8" textAnchor="middle">
                {formatX(Math.round(value))}
              </text>
            </g>
          )
        })}

        {/* Axes */}
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + chartHeight} stroke="#cbd5e1" strokeWidth="1" />
        <line x1={padding.left} y1={padding.top + chartHeight} x2={padding.left + chartWidth} y2={padding.top + chartHeight} stroke="#cbd5e1" strokeWidth="1" />

        {/* Median lines */}
        {medianX !== undefined && (
          <line
            x1={scaleX(medianX)} y1={padding.top}
            x2={scaleX(medianX)} y2={padding.top + chartHeight}
            stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4"
          />
        )}
        {medianY !== undefined && (
          <line
            x1={padding.left} y1={scaleY(medianY)}
            x2={padding.left + chartWidth} y2={scaleY(medianY)}
            stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4"
          />
        )}

        {/* Points */}
        {points.map((point, index) => (
          <circle
            key={index}
            cx={scaleX(point.x)}
            cy={scaleY(point.y)}
            r={5}
            fill={point.color}
            fillOpacity={0.7}
            stroke={point.color}
            strokeWidth="1"
            style={{ cursor: 'pointer' }}
            onMouseEnter={(e) => onPointMouseEnter?.(index, e)}
            onMouseLeave={(e) => onPointMouseLeave?.(index)}
          />
        ))}

        {/* Axis labels */}
        {yAxisLabel && (
          <text
            x={14}
            y={padding.top + chartHeight / 2}
            fontSize="12"
            fill="#64748b"
            textAnchor="middle"
            transform={`rotate(-90 14 ${padding.top + chartHeight / 2})`}
          >
            {yAxisLabel}
          </text>
        )}
        {xAxisLabel && (
          <text x={padding.left + chartWidth / 2} y={height - 8} fontSize="12" fill="#64748b" textAnchor="middle">
            {xAxisLabel}
          </text>
        )}
      </svg>
    </div>
  )
}

export default ScatterChart

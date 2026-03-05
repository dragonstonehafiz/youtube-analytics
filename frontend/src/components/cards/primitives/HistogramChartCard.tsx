import { useEffect, useRef, useState } from 'react'
import { HistogramChart } from '../../charts'
import './HistogramChartCard.css'

type HistogramChartCardProps = {
  title: string
  viewData: number[]
  color?: string
  binCount?: number
  binSize?: number
}

function HistogramChartCard({
  title,
  viewData,
  color = '#0ea5e9',
  binCount = 30,
  binSize,
}: HistogramChartCardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect()
      setDimensions({
        width: Math.max(400, rect.width),
        height: Math.max(300, rect.height),
      })
    })

    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [])

  return (
    <div className="histogram-chart-card">
      <h3 className="histogram-chart-card-title">{title}</h3>
      <div className="histogram-chart-card-body" ref={containerRef}>
        <HistogramChart
          data={viewData}
          color={color}
          binCount={binCount}
          binSize={binSize}
          width={dimensions.width}
          height={dimensions.height}
          xAxisLabel="Views"
          yAxisLabel="Number of Videos"
          ariaLabel={title}
        />
      </div>
    </div>
  )
}

export default HistogramChartCard

import './RatioBar.css'
import { useState } from 'react'

type RatioBarSegment = {
  key?: string
  ratio: number
  color: string
  title?: string
}

type RatioBarProps = {
  length: number | string
  color: string
  ratio: number
  segments?: RatioBarSegment[]
}

function RatioBar({ length, color, ratio, segments }: RatioBarProps) {
  const clampedRatio = Math.max(0, Math.min(100, ratio))
  const width = typeof length === 'number' ? `${length}px` : length
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  if (segments && segments.length > 0) {
    const hoveredSegment = hoveredIndex !== null ? segments[hoveredIndex] : null
    return (
      <div className="ratio-bar ratio-bar-segmented" style={{ width }} aria-hidden="true">
        <div className="ratio-bar-track">
          {segments.map((segment, index) => {
            const segmentRatio = Math.max(0, Math.min(100, segment.ratio))
            return (
              <div
                key={segment.key ?? `${index}-${segment.color}`}
                className="ratio-bar-segment"
                style={{ width: `${segmentRatio}%`, backgroundColor: segment.color }}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            )
          })}
        </div>
        {hoveredSegment?.title ? (
          <div className="ratio-bar-tooltip">{hoveredSegment.title}</div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="ratio-bar" style={{ width }} aria-hidden="true">
      <div className="ratio-bar-track">
        <div className="ratio-bar-fill" style={{ width: `${clampedRatio}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

export type { RatioBarSegment }
export type { RatioBarProps }
export default RatioBar

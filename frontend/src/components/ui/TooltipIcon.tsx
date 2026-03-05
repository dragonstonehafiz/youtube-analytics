import { useRef, useState } from 'react'
import Tooltip from './Tooltip'
import './TooltipIcon.css'

type TooltipIconProps = {
  content: string
  children?: React.ReactNode
}

function TooltipIcon({ content, children }: TooltipIconProps) {
  const iconRef = useRef<HTMLSpanElement>(null)
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const handleMouseEnter = () => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect()
      setTooltipPos({
        x: rect.left + rect.width / 2,
        y: rect.top,
      })
      setShowTooltip(true)
    }
  }

  return (
    <>
      <span
        ref={iconRef}
        className="tooltip-icon"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {children ?? '?'}
      </span>
      {showTooltip && (
        <Tooltip
          x={tooltipPos.x}
          y={tooltipPos.y}
          content={content}
          onMouseLeave={() => setShowTooltip(false)}
        />
      )}
    </>
  )
}

export default TooltipIcon

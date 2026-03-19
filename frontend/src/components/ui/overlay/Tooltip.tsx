import { useLayoutEffect, useRef } from 'react'
import './Tooltip.css'

type TooltipProps = {
  content: React.ReactNode
  x: number
  y: number
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

function Tooltip({ content, x, y, onMouseEnter, onMouseLeave }: TooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const clamp = (value: number, minValue: number, maxValue: number): number => {
    if (maxValue < minValue) {
      return minValue
    }
    return Math.min(Math.max(value, minValue), maxValue)
  }

  useLayoutEffect(() => {
    const tooltipElement = tooltipRef.current
    if (!tooltipElement) {
      return
    }

    const tooltipWidth = tooltipElement.offsetWidth || 120
    const tooltipHeight = tooltipElement.offsetHeight || 50
    const viewportMargin = 8
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    const desiredLeft = x - tooltipWidth / 2
    const minLeft = viewportMargin
    const maxLeft = viewportWidth - viewportMargin - tooltipWidth
    const left = clamp(desiredLeft, minLeft, maxLeft)

    const defaultTopGap = 8
    const desiredTop = y - tooltipHeight - defaultTopGap
    const minTop = viewportMargin
    const maxTop = viewportHeight - viewportMargin - tooltipHeight

    const top = clamp(desiredTop, minTop, maxTop)

    tooltipElement.style.left = `${left}px`
    tooltipElement.style.top = `${top}px`
  }, [x, y])

  return (
    <div
      ref={tooltipRef}
      className="tooltip-popup"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {content}
    </div>
  )
}

export default Tooltip

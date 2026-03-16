import { useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

export type UploadPublishTooltipItem = {
  video_id?: string
  title: string
  published_at: string
  thumbnail_url: string
  content_type: string
  detail?: string
}

export type UploadHoverState = {
  x: number
  y: number
  items: UploadPublishTooltipItem[]
  key: string
  startDate: string
  endDate: string
  dayCount: number
}

type UploadPublishTooltipProps = {
  hover: UploadHoverState | null
  onMouseEnter: () => void
  onMouseLeave: () => void
  titleOverride?: string
  statsOverride?: string[]
}

function UploadPublishTooltip({
  hover,
  onMouseEnter,
  onMouseLeave,
  titleOverride,
  statsOverride,
}: UploadPublishTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<{ left: number; top: number; placement: 'above' | 'below'; arrowLeft: number }>({
    left: 0,
    top: 0,
    placement: 'below',
    arrowLeft: 20,
  })
  const clamp = (value: number, minValue: number, maxValue: number): number => {
    if (maxValue < minValue) {
      return minValue
    }
    return Math.min(Math.max(value, minValue), maxValue)
  }
  useLayoutEffect(() => {
    if (!hover) {
      return
    }
    const tooltipElement = tooltipRef.current
    if (!tooltipElement) {
      return
    }
    const parentElement = tooltipElement.offsetParent as HTMLElement | null
    const parentRect = parentElement?.getBoundingClientRect() ?? { left: 0, top: 0 }
    const parentWidth = parentElement?.clientWidth ?? 0
    const tooltipHeight = tooltipElement.offsetHeight || 180
    const tooltipWidth = tooltipElement.offsetWidth || 260
    const viewportMargin = 8
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const desiredLeft = hover.x - tooltipWidth / 2
    const parentInnerMargin = 4
    const minLeftByParent = parentInnerMargin
    const maxLeftByParent = Math.max(parentInnerMargin, parentWidth - tooltipWidth - parentInnerMargin)
    const minLeftByViewport = viewportMargin - parentRect.left
    const maxLeftByViewport = viewportWidth - viewportMargin - parentRect.left - tooltipWidth
    const minLeft = Math.max(minLeftByParent, minLeftByViewport)
    const maxLeft = Math.min(maxLeftByParent, maxLeftByViewport)
    const left = clamp(desiredLeft, minLeft, maxLeft)
    const defaultTopGap = 8
    const desiredTop = hover.y + defaultTopGap
    const minTop = viewportMargin - parentRect.top
    const maxTop = viewportHeight - viewportMargin - parentRect.top - tooltipHeight
    const top = clamp(desiredTop, minTop, maxTop)
    const placement: 'above' | 'below' = top + tooltipHeight <= hover.y ? 'above' : 'below'
    const arrowLeft = clamp(hover.x - left, 12, tooltipWidth - 12)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPosition({ left, top, placement, arrowLeft })
  }, [hover])
  if (!hover) {
    return null
  }
  const headerTitle = typeof titleOverride === 'string' ? titleOverride : `${hover.startDate} to ${hover.endDate}`
  const statLines = Array.isArray(statsOverride)
    ? statsOverride
    : [
        `${hover.dayCount} ${hover.dayCount === 1 ? 'day' : 'days'}`,
        `${hover.items.length} ${hover.items.length === 1 ? 'video' : 'videos'} published`,
      ]
  return (
    <div
      ref={tooltipRef}
      className={`chart-tooltip publish-tooltip tooltip-clamped tooltip-with-indicator ${
        position.placement === 'above' ? 'tooltip-above' : 'tooltip-below'
      }`}
      style={{
        left: position.left,
        top: position.top,
        ['--tooltip-arrow-left' as string]: `${position.arrowLeft}px`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="tooltip-date">{headerTitle}</div>
      {statLines.map((line, index) => (
        <div key={`${line}-${index}`} className="tooltip-date">
          {line}
        </div>
      ))}
      <ul>
        {hover.items.map((item, index) => (
          <li key={`${item.title}-${index}`} className="publish-item">
            {item.thumbnail_url ? (
              <img className="publish-thumb" src={item.thumbnail_url} alt={item.title} />
            ) : (
              <div className="publish-thumb" />
            )}
            <div>
              {item.video_id ? (
                <Link className="publish-title publish-title-link" to={`/videos/${item.video_id}`}>
                  {item.title}
                </Link>
              ) : (
                <div className="publish-title">{item.title}</div>
              )}
              <div className="publish-date">{item.detail ?? (item.published_at?.split('T')[0] || '')}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default UploadPublishTooltip

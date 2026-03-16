import type { MutableRefObject } from 'react'
import UploadPublishTooltip from './UploadPublishTooltip'
import type { UploadHoverState } from './UploadPublishTooltip'

type SpikeHoverHandlers = {
  setHoverSpike: (hover: UploadHoverState | null) => void
  spikeTimeoutRef: MutableRefObject<number | null>
  spikeHoverLockedRef: MutableRefObject<boolean>
}

type Props = {
  hoverSpike: UploadHoverState | null
  hoverHandlers: SpikeHoverHandlers
}

export default function SpikeTooltipOverlay({ hoverSpike, hoverHandlers }: Props) {
  const { setHoverSpike, spikeTimeoutRef, spikeHoverLockedRef } = hoverHandlers
  return (
    <UploadPublishTooltip
      hover={hoverSpike}
      titleOverride={hoverSpike ? `Spike: ${hoverSpike.startDate} → ${hoverSpike.endDate}` : undefined}
      statsOverride={hoverSpike ? [`${hoverSpike.items.length} top ${hoverSpike.items.length === 1 ? 'video' : 'videos'} during spike`] : undefined}
      onMouseEnter={() => {
        if (spikeTimeoutRef.current) window.clearTimeout(spikeTimeoutRef.current)
        spikeHoverLockedRef.current = true
      }}
      onMouseLeave={() => {
        spikeHoverLockedRef.current = false
        if (spikeTimeoutRef.current) window.clearTimeout(spikeTimeoutRef.current)
        spikeTimeoutRef.current = window.setTimeout(() => {
          if (!spikeHoverLockedRef.current) setHoverSpike(null)
        }, 150)
      }}
    />
  )
}

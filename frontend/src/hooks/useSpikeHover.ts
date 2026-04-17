import { useMemo, useRef, useState } from 'react'
import { type UploadHoverState } from '@components/charts/UploadPublishTooltip'

export type SpikeHoverHandlers = {
  setHoverSpike: (hover: UploadHoverState | null) => void
  spikeTimeoutRef: React.MutableRefObject<number | null>
  spikeHoverLockedRef: React.MutableRefObject<boolean>
}

export function useSpikeHover(): { hoverSpike: UploadHoverState | null; hoverHandlers: SpikeHoverHandlers } {
  const [hoverSpike, setHoverSpike] = useState<UploadHoverState | null>(null)
  const spikeTimeoutRef = useRef<number | null>(null)
  const spikeHoverLockedRef = useRef(false)
  const hoverHandlers = useMemo(() => ({ setHoverSpike, spikeTimeoutRef, spikeHoverLockedRef }), [])
  return { hoverSpike, hoverHandlers }
}

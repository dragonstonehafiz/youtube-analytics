import { useEffect, useRef, useState } from 'react'
import { Dropdown, VideoThumbnail, DisplayVideoTitle } from '../../../../ui'
import { formatWholeNumber } from '../../../../../utils/number'
import './TrafficSourceTopVideosCard.css'

type TopTrafficVideo = {
  video_id: string
  title: string
  thumbnail_url: string
  views: number
  watch_time_minutes: number
}

type TrafficSourceOption = {
  label: string
  value: string
}

type TrafficSourceTopVideosCardProps = {
  source: string
  sourceOptions: TrafficSourceOption[]
  items: TopTrafficVideo[]
  loading: boolean
  error: string | null
  onSourceChange: (value: string) => void
  onOpenVideo: (videoId: string) => void
}

function TrafficSourceTopVideosCard({
  source,
  sourceOptions,
  items,
  loading,
  error,
  onSourceChange,
  onOpenVideo,
}: TrafficSourceTopVideosCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [cardWidth, setCardWidth] = useState(0)
  const COMPACT_WIDTH = 420
  const isCompact = cardWidth > 0 && cardWidth <= COMPACT_WIDTH

  useEffect(() => {
    if (!cardRef.current) {
      return
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCardWidth(Math.floor(entry.contentRect.width))
      }
    })
    observer.observe(cardRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div className={isCompact ? 'traffic-top-card compact' : 'traffic-top-card'} ref={cardRef}>
      <div className={isCompact ? 'traffic-top-title-header compact' : 'traffic-top-title-header'}>
        Top videos by traffic source
      </div>
      <div className="traffic-top-controls">
        <Dropdown
          value={source}
          onChange={onSourceChange}
          placeholder="Select source"
          items={sourceOptions.map((option) => ({ type: 'option' as const, ...option }))}
        />
      </div>
      {loading ? <div className="traffic-top-state">Loading videos...</div> : null}
      {error ? <div className="traffic-top-state">{error}</div> : null}
      {!loading && !error ? (
        items.length === 0 ? (
          <div className="traffic-top-state">No videos for this source in the selected range.</div>
        ) : (
          <div className="traffic-top-list">
            <div className="traffic-top-header" role="row">
              <span className="traffic-top-header-rank">#</span>
              <span className="traffic-top-header-video">Video</span>
              <span className="traffic-top-header-metric">Views</span>
              <span className="traffic-top-header-metric">Watch time (hours)</span>
            </div>
            {items.map((item, index) => (
              <div key={`${item.video_id}-${index}`} className="traffic-top-row">
                <span className="traffic-top-rank">{index + 1}</span>
                <VideoThumbnail url={item.thumbnail_url} title={item.title} className="traffic-top-thumb" />
                <button type="button" className="traffic-top-title" onClick={() => onOpenVideo(item.video_id)}>
                  <DisplayVideoTitle title={item.title} />
                </button>
                <span className="traffic-top-metric">{formatWholeNumber(item.views)}</span>
                <span className="traffic-top-metric">{formatWholeNumber(Math.round(item.watch_time_minutes / 60))}</span>
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  )
}

export type { TopTrafficVideo, TrafficSourceOption }
export default TrafficSourceTopVideosCard

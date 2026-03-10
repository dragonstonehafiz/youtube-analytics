export type PublishedItem = { video_id?: string; title: string; published_at: string; thumbnail_url: string; content_type: string }

type MarkerType = 'video' | 'short'

export type ClusteredPublishMarker = {
  x: number
  key: string
  items: PublishedItem[]
  markerType: MarkerType
  startDate: string
  endDate: string
  dayCount: number
}

type UploadPublishMarkersProps = {
  markers: ClusteredPublishMarker[]
  chartHeight: number
  activeKey: string | null
  onMarkerEnter: (marker: ClusteredPublishMarker, y: number) => void
  onMarkerLeave: () => void
}

function UploadPublishMarkers({
  markers,
  chartHeight,
  activeKey,
  onMarkerEnter,
  onMarkerLeave,
}: UploadPublishMarkersProps) {
  return (
    <>
      {markers.map((marker, index) => {
        const markerY = chartHeight - 12
        return (
          <g
            key={`publish-${index}`}
            className={activeKey === marker.key ? 'publish-group active' : 'publish-group'}
            onMouseEnter={() => onMarkerEnter(marker, markerY)}
            onMouseLeave={onMarkerLeave}
          >
            <circle cx={marker.x} cy={markerY} r={9} className="publish-hit" />
            <circle
              cx={marker.x}
              cy={markerY}
              r={8}
              className={`publish-icon ${marker.markerType === 'short' ? 'publish-icon-short' : ''}`}
            />
            {marker.items.length > 1 ? (
              <text x={marker.x} y={chartHeight - 8} textAnchor="middle" fontSize="10" className="publish-count">
                {marker.items.length}
              </text>
            ) : (
              <polygon
                className="publish-play"
                points={`${marker.x - 2.8},${markerY - 4.2} ${marker.x - 2.8},${markerY + 4.2} ${marker.x + 3.8},${markerY}`}
              />
            )}
          </g>
        )
      })}
    </>
  )
}

export default UploadPublishMarkers

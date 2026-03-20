import { useState, useEffect } from 'react'
import { type SpikeRegion } from '../components/charts'
import { type UploadHoverState, type UploadPublishTooltipItem } from '../components/charts/UploadPublishTooltip'

type RawRegion = { start_date: string; end_date: string }
type RawContributor = {
  video_id: string
  title: string
  thumbnail_url: string
  content_type: string
  published_at: string
  metric_value: number
}

type SpikeHoverHandlers = {
  setHoverSpike: (hover: UploadHoverState | null) => void
  spikeTimeoutRef: React.MutableRefObject<number | null>
  spikeHoverLockedRef: React.MutableRefObject<boolean>
}

export function useSpikes(
  start: string,
  end: string,
  metric: string = 'views',
  granularity: string = 'daily',
  hoverHandlers: SpikeHoverHandlers,
  videoIds: string[] = [],
  contentType: string | null = null,
  dataSourceLevel: 'channel' | 'video' | 'playlist' = 'video'
): SpikeRegion[] {
  const [spikeRegions, setSpikeRegions] = useState<SpikeRegion[]>([])
  const { setHoverSpike, spikeTimeoutRef, spikeHoverLockedRef } = hoverHandlers

  useEffect(() => {
    if (!start || !end) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSpikeRegions([])
      return
    }

    // Playlist-level data does not use spike detection
    if (dataSourceLevel === 'playlist') {
      return
    }

    const abortController = new AbortController()

    async function load() {
      try {
        let outliersUrl: string
        if (dataSourceLevel === 'channel') {
          outliersUrl = `http://localhost:8000/outliers/channel?start_date=${start}&end_date=${end}&metric=${metric}&granularity=${granularity}`
        } else {
          const videoIdsParam = videoIds.length > 0 ? `&video_ids=${videoIds.join(',')}` : ''
          const contentTypeParam = contentType ? `&content_type=${contentType}` : ''
          outliersUrl = `http://localhost:8000/outliers/video?start_date=${start}&end_date=${end}&metric=${metric}&granularity=${granularity}${videoIdsParam}${contentTypeParam}`
        }
        const outliersRes = await fetch(outliersUrl, { signal: abortController.signal })
        const outliersData = await outliersRes.json()
        const regions: RawRegion[] = Array.isArray(outliersData.items) ? outliersData.items : []

        if (!regions.length) {
          setSpikeRegions([])
          return
        }

        // Determine which batch endpoint to use
        let contributorsRes
        if (videoIds.length > 0 || dataSourceLevel === 'channel') {
          contributorsRes = await fetch(
            'http://localhost:8000/outliers/video/top-contributors/video-ids',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                regions,
                metric,
                video_ids: videoIds,
              }),
              signal: abortController.signal,
            }
          )
        } else if (contentType !== null) {
          contributorsRes = await fetch(
            'http://localhost:8000/outliers/video/top-contributors/content-type',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                regions,
                metric,
                content_type: contentType,
              }),
              signal: abortController.signal,
            }
          )
        } else {
          contributorsRes = await fetch(
            'http://localhost:8000/outliers/video/top-contributors/video-ids',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                regions,
                metric,
                video_ids: [],
              }),
              signal: abortController.signal,
            }
          )
        }

        const contributorsData = await contributorsRes.json()
        const regionContributors: Record<string, RawContributor[]> = {}
        if (Array.isArray(contributorsData.items)) {
          for (const item of contributorsData.items) {
            regionContributors[`${item.start_date}__${item.end_date}`] = Array.isArray(item.contributors) ? item.contributors : []
          }
        }

        const metricLabels: Record<string, string> = {
          views: 'views',
          watch_time_minutes: 'min watched',
          estimated_revenue: 'revenue',
          subscribers_gained: 'subscribers',
          likes: 'likes',
          comments: 'comments',
        }
        const metricLabel = metricLabels[metric] ?? metric

        const built: SpikeRegion[] = regions.map((region) => {
          const contributors = regionContributors[`${region.start_date}__${region.end_date}`] || []

          const items: UploadPublishTooltipItem[] = contributors.map((c) => {
            const uploadDate = c.published_at ? new Date(c.published_at).toISOString().split('T')[0] : 'Unknown'
            return {
              video_id: c.video_id,
              title: c.title,
              thumbnail_url: c.thumbnail_url,
              content_type: c.content_type,
              published_at: c.published_at || '',
              detail: `${c.metric_value.toLocaleString()} ${metricLabel} • ${uploadDate}`,
            }
          })

          return {
            start_date: region.start_date,
            end_date: region.end_date,
            items,
            onMouseEnter: (x: number, y: number) => {
              if (spikeTimeoutRef.current) {
                window.clearTimeout(spikeTimeoutRef.current)
              }
              setHoverSpike({
                x,
                y,
                items,
                key: `spike-${region.start_date}`,
                startDate: region.start_date,
                endDate: region.end_date,
                dayCount: 0,
              })
            },
            onMouseLeave: () => {
              if (spikeTimeoutRef.current) {
                window.clearTimeout(spikeTimeoutRef.current)
              }
              spikeTimeoutRef.current = window.setTimeout(() => {
                if (!spikeHoverLockedRef.current) {
                  setHoverSpike(null)
                }
              }, 150)
            },
          }
        })

        setSpikeRegions(built)
      } catch {
        setSpikeRegions([])
      }
    }

    load()

    return () => {
      abortController.abort()
    }
  }, [start, end, metric, granularity, videoIds, contentType, dataSourceLevel, setHoverSpike, spikeTimeoutRef, spikeHoverLockedRef])

  return spikeRegions
}

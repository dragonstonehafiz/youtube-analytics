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
  videoIds: string[] = []
): SpikeRegion[] {
  const [spikeRegions, setSpikeRegions] = useState<SpikeRegion[]>([])
  const { setHoverSpike, spikeTimeoutRef, spikeHoverLockedRef } = hoverHandlers

  useEffect(() => {
    // Clear old spikes immediately when parameters change
    setSpikeRegions([])

    if (!start || !end) {
      return
    }

    const abortController = new AbortController()

    async function load() {
      try {
        const videoIdsParam = videoIds.length > 0 ? `&video_ids=${videoIds.join(',')}` : ''
        const outliersRes = await fetch(
          `http://localhost:8000/analytics/channel-daily/outliers?start_date=${start}&end_date=${end}&metric=${metric}&granularity=${granularity}${videoIdsParam}`,
          { signal: abortController.signal }
        )
        const outliersData = await outliersRes.json()
        const regions: RawRegion[] = Array.isArray(outliersData.items) ? outliersData.items : []

        if (!regions.length) {
          setSpikeRegions([])
          return
        }

        const built: SpikeRegion[] = await Promise.all(
          regions.map(async (region) => {
            const videoIdsParam = videoIds.length > 0 ? `&video_ids=${videoIds.join(',')}` : ''
            const contributorsRes = await fetch(
              `http://localhost:8000/analytics/video-daily/top-contributors?start_date=${region.start_date}&end_date=${region.end_date}&metric=${metric}${videoIdsParam}`,
              { signal: abortController.signal }
            )
            const contributorsData = await contributorsRes.json()
            const contributors: RawContributor[] = Array.isArray(contributorsData.items) ? contributorsData.items : []

            const metricLabels: Record<string, string> = {
              views: 'views',
              watch_time_minutes: 'min watched',
              estimated_revenue: 'revenue',
              subscribers_gained: 'subscribers',
              likes: 'likes',
              comments: 'comments',
            }
            const metricLabel = metricLabels[metric] ?? metric

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
        )

        setSpikeRegions(built)
      } catch {
        setSpikeRegions([])
      }
    }

    load()

    return () => {
      abortController.abort()
    }
  }, [start, end, metric, granularity, videoIds])

  return spikeRegions
}

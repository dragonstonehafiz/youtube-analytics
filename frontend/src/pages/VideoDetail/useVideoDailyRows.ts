import { useState, useEffect } from 'react'
import type { VideoDailyRow } from '@types'
import { sortVideoDailyRows } from './utils'

type UseVideoDailyRowsResult = {
  rows: VideoDailyRow[]
  loading: boolean
  error: string | null
}

export function useVideoDailyRows(videoId: string | undefined): UseVideoDailyRowsResult {
  const [rows, setRows] = useState<VideoDailyRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!videoId) {
      setRows([])
      setError('Missing video ID.')
      return
    }
    setLoading(true)
    setError(null)
    let cancelled = false

    async function load() {
      const currentVideoId = videoId as string
      try {
        const params = new URLSearchParams({ video_ids: currentVideoId, limit: '10000' })
        const response = await fetch(`http://localhost:8000/analytics/video?${params}`)
        if (!response.ok) throw new Error(`Failed to load analytics (${response.status})`)
        const data = await response.json()
        const rawItems = Array.isArray(data.items) ? data.items : []
        const items: VideoDailyRow[] = (rawItems as Array<Record<string, unknown>>).map((item) => ({
          ...item,
          day: typeof item.date === 'string' ? item.date : String(item.day ?? ''),
        })) as VideoDailyRow[]
        if (!cancelled) setRows(sortVideoDailyRows(items))
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load analytics.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [videoId])

  return { rows, loading, error }
}

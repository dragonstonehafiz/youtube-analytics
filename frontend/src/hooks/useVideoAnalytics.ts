import { useState, useEffect } from 'react'
import type { DateRange, VideoDailyRow } from '../types'

export type { VideoDailyRow }

type Options = { skip?: boolean }

type UseVideoAnalyticsResult = {
  rows: VideoDailyRow[]
  previousRows: VideoDailyRow[]
  loading: boolean
  error: string | null
}

export function normalizeVideoRows(items: unknown[]): VideoDailyRow[] {
  return (items as Array<Record<string, unknown>>).map((item) => ({
    ...item,
    day: typeof item.date === 'string' ? item.date : String(item.day ?? ''),
  })) as VideoDailyRow[]
}

async function fetchVideoDaily(videoIds: string[], start: string, end: string): Promise<VideoDailyRow[]> {
  const csv = encodeURIComponent(videoIds.join(','))
  const res = await fetch(
    `http://localhost:8000/analytics/video-analytics?video_ids=${csv}&start_date=${start}&end_date=${end}`
  )
  if (!res.ok) throw new Error(`Failed to load video analytics (${res.status})`)
  const data = await res.json()
  return normalizeVideoRows(Array.isArray(data.items) ? data.items : [])
}

/**
 * Fetches video-daily analytics for an explicit list of video IDs.
 * Returns empty results when videoIds is empty.
 * Normalises the API's `date` field to `day` on all returned rows.
 */
export function useVideoAnalyticsByIds(
  videoIds: string[],
  range: DateRange,
  previousRange: DateRange,
): UseVideoAnalyticsResult {
  const [rows, setRows] = useState<VideoDailyRow[]>([])
  const [previousRows, setPreviousRows] = useState<VideoDailyRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const idsKey = videoIds.join(',')

  useEffect(() => {
    if (videoIds.length === 0) {
      setRows([])
      setPreviousRows([])
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [current, previous] = await Promise.all([
          fetchVideoDaily(videoIds, range.start, range.end),
          fetchVideoDaily(videoIds, previousRange.start, previousRange.end),
        ])
        if (!cancelled) {
          setRows(current)
          setPreviousRows(previous)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load video analytics.')
          setRows([])
          setPreviousRows([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, range.start, range.end, previousRange.start, previousRange.end])

  return { rows, previousRows, loading, error }
}

/**
 * Fetches video-daily analytics for all videos matching a content type.
 * For contentType='all', fetches all videos (up to 500).
 * Normalises the API's `date` field to `day` on all returned rows.
 */
export function useVideoAnalyticsByContentType(
  contentType: string,
  range: DateRange,
  previousRange: DateRange,
  options?: Options,
): UseVideoAnalyticsResult {
  const skip = options?.skip ?? false
  const [rows, setRows] = useState<VideoDailyRow[]>([])
  const [previousRows, setPreviousRows] = useState<VideoDailyRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (skip) {
      setRows([])
      setPreviousRows([])
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const videosUrl =
          contentType === 'all'
            ? 'http://localhost:8000/videos?page_size=500'
            : `http://localhost:8000/videos?content_type=${contentType}&page_size=500`
        const videosRes = await fetch(videosUrl)
        if (!videosRes.ok) throw new Error(`Failed to load video list (${videosRes.status})`)
        const videosData = await videosRes.json()
        const videoIds: string[] = (Array.isArray(videosData.items) ? videosData.items : [])
          .map((v: { video_id?: string }) => v.video_id)
          .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
        if (videoIds.length === 0) {
          if (!cancelled) { setRows([]); setPreviousRows([]) }
          return
        }
        const [current, previous] = await Promise.all([
          fetchVideoDaily(videoIds, range.start, range.end),
          fetchVideoDaily(videoIds, previousRange.start, previousRange.end),
        ])
        if (!cancelled) {
          setRows(current)
          setPreviousRows(previous)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load video analytics.')
          setRows([])
          setPreviousRows([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [skip, contentType, range.start, range.end, previousRange.start, previousRange.end])

  return { rows, previousRows, loading, error }
}

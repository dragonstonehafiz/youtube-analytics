import { useState, useEffect } from 'react'
import type { VideoDailyRow } from './useVideoAnalytics'

export type PlaylistDailyRow = {
  day: string
  views?: number | null
  watch_time_minutes?: number | null
  estimated_revenue?: number | null
  ad_impressions?: number | null
  monetized_playbacks?: number | null
  cpm?: number | null
  average_view_duration_seconds?: number | null
  playlist_starts?: number | null
  views_per_playlist_start?: number | null
  average_time_in_playlist_seconds?: number | null
  subscribers_gained?: number | null
  subscribers_lost?: number | null
}

export type PlaylistTotals = {
  views?: number | null
  watch_time_minutes?: number | null
  estimated_revenue?: number | null
  playlist_starts?: number | null
}

type DateRange = { start: string; end: string }

type UsePlaylistAnalyticsResult = {
  playlistRows: PlaylistDailyRow[]
  previousPlaylistRows: PlaylistDailyRow[]
  videoRows: VideoDailyRow[]
  previousVideoRows: VideoDailyRow[]
  playlistTotals: PlaylistTotals
  loading: boolean
  error: string | null
}

function sortByDay<T extends { day: string }>(rows: T[]): T[] {
  return [...rows].filter((r) => typeof r.day === 'string').sort((a, b) => a.day.localeCompare(b.day))
}

function normalizeVideoItems(items: unknown[]): VideoDailyRow[] {
  return (items as Array<Record<string, unknown>>).map((item) => ({
    ...item,
    day: typeof item.date === 'string' ? item.date : String(item.day ?? ''),
  })) as VideoDailyRow[]
}

/**
 * Fetches both playlist-daily and video-daily analytics for a playlist.
 * playlist-daily rows have playlist-specific fields (playlist_starts, etc.).
 * video-daily rows are normalised from `date` to `day`.
 * Replaces the old playlist-video-daily endpoint.
 */
export function usePlaylistAnalytics(
  playlistId: string | undefined,
  videoIds: string[],
  range: DateRange,
  previousRange: DateRange,
): UsePlaylistAnalyticsResult {
  const [playlistRows, setPlaylistRows] = useState<PlaylistDailyRow[]>([])
  const [previousPlaylistRows, setPreviousPlaylistRows] = useState<PlaylistDailyRow[]>([])
  const [videoRows, setVideoRows] = useState<VideoDailyRow[]>([])
  const [previousVideoRows, setPreviousVideoRows] = useState<VideoDailyRow[]>([])
  const [playlistTotals, setPlaylistTotals] = useState<PlaylistTotals>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const idsKey = videoIds.join(',')

  useEffect(() => {
    if (!playlistId) {
      setPlaylistRows([])
      setPreviousPlaylistRows([])
      setVideoRows([])
      setPreviousVideoRows([])
      setPlaylistTotals({})
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const plBase = `http://localhost:8000/analytics/playlist-daily?playlist_id=${playlistId}`
        const videoBase =
          videoIds.length > 0
            ? `http://localhost:8000/analytics/video-daily?video_ids=${encodeURIComponent(videoIds.join(','))}`
            : null

        const requests: Promise<Response>[] = [
          fetch(`${plBase}&start_date=${range.start}&end_date=${range.end}`),
          fetch(`${plBase}&start_date=${previousRange.start}&end_date=${previousRange.end}`),
        ]
        if (videoBase) {
          requests.push(fetch(`${videoBase}&start_date=${range.start}&end_date=${range.end}`))
          requests.push(fetch(`${videoBase}&start_date=${previousRange.start}&end_date=${previousRange.end}`))
        }

        const responses = await Promise.all(requests)
        const bad = responses.find((r) => !r.ok)
        if (bad) throw new Error(`Failed to load playlist analytics (${bad.status})`)

        const results = await Promise.all(responses.map((r) => r.json()))
        const [plData, plPrevData, ...videoResults] = results

        if (!cancelled) {
          setPlaylistRows(sortByDay(Array.isArray(plData.items) ? plData.items : []))
          setPreviousPlaylistRows(sortByDay(Array.isArray(plPrevData.items) ? plPrevData.items : []))
          setPlaylistTotals(plData.totals ?? {})
          if (videoBase && videoResults.length >= 2) {
            setVideoRows(sortByDay(normalizeVideoItems(Array.isArray(videoResults[0].items) ? videoResults[0].items : [])))
            setPreviousVideoRows(sortByDay(normalizeVideoItems(Array.isArray(videoResults[1].items) ? videoResults[1].items : [])))
          } else {
            setVideoRows([])
            setPreviousVideoRows([])
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load playlist analytics.')
          setPlaylistRows([])
          setPreviousPlaylistRows([])
          setVideoRows([])
          setPreviousVideoRows([])
          setPlaylistTotals({})
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId, idsKey, range.start, range.end, previousRange.start, previousRange.end])

  return { playlistRows, previousPlaylistRows, videoRows, previousVideoRows, playlistTotals, loading, error }
}

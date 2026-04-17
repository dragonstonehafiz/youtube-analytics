import { useState, useEffect } from 'react'
import type { DateRange, VideoDailyRow, PlaylistDailyRow, PlaylistTotals } from '@types'
import { normalizeVideoRows } from './useVideoAnalytics'

export type { PlaylistDailyRow, PlaylistTotals }

type Options = { skip?: boolean }
export type { Options as PlaylistAnalyticsOptions }

type UsePlaylistAnalyticsResult = {
  playlistRows: PlaylistDailyRow[]
  previousPlaylistRows: PlaylistDailyRow[]
  videoRows: VideoDailyRow[]
  previousVideoRows: VideoDailyRow[]
  playlistTotals: PlaylistTotals
  videoTotals: PlaylistTotals
  loading: boolean
  error: string | null
}

function sortByDay<T extends { day: string }>(rows: T[]): T[] {
  return [...rows].filter((r) => typeof r.day === 'string').sort((a, b) => a.day.localeCompare(b.day))
}

function computeVideoTotals(rows: VideoDailyRow[]): PlaylistTotals {
  if (rows.length === 0) {
    return {}
  }
  return {
    views: rows.reduce((sum, r) => sum + (r.views ?? 0), 0),
    watch_time_minutes: rows.reduce((sum, r) => sum + (r.watch_time_minutes ?? 0), 0),
    estimated_revenue: rows.reduce((sum, r) => sum + (r.estimated_revenue ?? 0), 0),
  }
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
  options: Options = {},
): UsePlaylistAnalyticsResult {
  const { skip = false } = options
  const [playlistRows, setPlaylistRows] = useState<PlaylistDailyRow[]>([])
  const [previousPlaylistRows, setPreviousPlaylistRows] = useState<PlaylistDailyRow[]>([])
  const [videoRows, setVideoRows] = useState<VideoDailyRow[]>([])
  const [previousVideoRows, setPreviousVideoRows] = useState<VideoDailyRow[]>([])
  const [playlistTotals, setPlaylistTotals] = useState<PlaylistTotals>({})
  const [videoTotals, setVideoTotals] = useState<PlaylistTotals>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const idsKey = videoIds.join(',')

  useEffect(() => {
    if (!playlistId || skip) {
      setPlaylistRows([])
      setPreviousPlaylistRows([])
      setVideoRows([])
      setPreviousVideoRows([])
      setPlaylistTotals({})
      setVideoTotals({})
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const plBase = `http://localhost:8000/analytics/playlist/${playlistId}`
        const videoBase =
          videoIds.length > 0
            ? `http://localhost:8000/analytics/video?video_ids=${encodeURIComponent(videoIds.join(','))}`
            : null

        const requests: Promise<Response>[] = [
          fetch(`${plBase}?start_date=${range.start}&end_date=${range.end}`),
          fetch(`${plBase}?start_date=${previousRange.start}&end_date=${previousRange.end}`),
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
            const normalized = sortByDay(normalizeVideoRows(Array.isArray(videoResults[0].items) ? videoResults[0].items : []))
            const normalizedPrev = sortByDay(normalizeVideoRows(Array.isArray(videoResults[1].items) ? videoResults[1].items : []))
            setVideoRows(normalized)
            setPreviousVideoRows(normalizedPrev)
            setVideoTotals(computeVideoTotals(normalized))
          } else {
            setVideoRows([])
            setPreviousVideoRows([])
            setVideoTotals({})
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
          setVideoTotals({})
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId, skip, idsKey, range.start, range.end, previousRange.start, previousRange.end])

  return { playlistRows, previousPlaylistRows, videoRows, previousVideoRows, playlistTotals, videoTotals, loading, error }
}

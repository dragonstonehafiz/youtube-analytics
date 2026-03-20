import { useEffect, useState } from 'react'
import type { SearchInsightsTopTerm } from '../../components/cards'
import type { TrafficSourceRow } from '../../utils/trafficSeries'
import type { DateRange } from '../../types'

type TopSearchResponseItem = {
  search_term: string
  views: number
  watch_time_minutes: number
  video_count: number
}

type Options = {
  skip?: boolean
}

export type UseVideoDiscoveryResult = {
  trafficRows: TrafficSourceRow[]
  previousTrafficRows: TrafficSourceRow[]
  trafficLoading: boolean
  trafficError: string | null
  searchTopTerms: SearchInsightsTopTerm[]
  searchTopTermsLoading: boolean
  searchTopTermsError: string | null
}

function normalizeTrafficRows(items: TrafficSourceRow[]): TrafficSourceRow[] {
  return items.map((item) => ({
    day: String(item?.day ?? ''),
    traffic_source: String(item?.traffic_source ?? ''),
    views: Number(item?.views ?? 0),
    watch_time_minutes: Number(item?.watch_time_minutes ?? 0),
  }))
}

export function useVideoDiscovery(
  videoId: string | undefined,
  range: DateRange,
  previousRange: DateRange,
  options?: Options,
): UseVideoDiscoveryResult {
  const skip = options?.skip ?? false
  const [trafficRows, setTrafficRows] = useState<TrafficSourceRow[]>([])
  const [previousTrafficRows, setPreviousTrafficRows] = useState<TrafficSourceRow[]>([])
  const [trafficLoading, setTrafficLoading] = useState(false)
  const [trafficError, setTrafficError] = useState<string | null>(null)
  const [searchTopTerms, setSearchTopTerms] = useState<SearchInsightsTopTerm[]>([])
  const [searchTopTermsLoading, setSearchTopTermsLoading] = useState(false)
  const [searchTopTermsError, setSearchTopTermsError] = useState<string | null>(null)

  useEffect(() => {
    if (skip || !videoId) {
      setTrafficRows([])
      setPreviousTrafficRows([])
      setTrafficLoading(false)
      setTrafficError(null)
      return
    }
    let cancelled = false
    async function loadDiscoveryTraffic() {
      setTrafficLoading(true)
      setTrafficError(null)
      try {
        const [currentResponse, previousResponse] = await Promise.all([
          fetch(`http://localhost:8000/analytics/video-traffic-sources?start_date=${range.start}&end_date=${range.end}&video_ids=${videoId}`),
          fetch(`http://localhost:8000/analytics/video-traffic-sources?start_date=${previousRange.start}&end_date=${previousRange.end}&video_ids=${videoId}`),
        ])
        const [currentData, previousData] = await Promise.all([currentResponse.json(), previousResponse.json()])
        if (!cancelled) {
          setTrafficRows(Array.isArray(currentData?.items) ? normalizeTrafficRows(currentData.items) : [])
          setPreviousTrafficRows(Array.isArray(previousData?.items) ? normalizeTrafficRows(previousData.items) : [])
        }
      } catch {
        if (!cancelled) {
          setTrafficRows([])
          setPreviousTrafficRows([])
          setTrafficError('Failed to load traffic sources.')
        }
      } finally {
        if (!cancelled) {
          setTrafficLoading(false)
        }
      }
    }
    loadDiscoveryTraffic()
    return () => {
      cancelled = true
    }
  }, [skip, videoId, range.start, range.end, previousRange.start, previousRange.end])

  useEffect(() => {
    if (skip || !videoId) {
      setSearchTopTerms([])
      setSearchTopTermsLoading(false)
      setSearchTopTermsError(null)
      return
    }
    const currentVideoId = videoId
    let cancelled = false
    async function loadTopSearchTerms() {
      setSearchTopTermsLoading(true)
      setSearchTopTermsError(null)
      try {
        const params = new URLSearchParams({ start_date: range.start, end_date: range.end, video_ids: currentVideoId })
        const response = await fetch(`http://localhost:8000/analytics/video-search-insights?${params.toString()}`)
        if (!response.ok) throw new Error(`Failed to load top search terms (${response.status})`)
        const payload = await response.json()
        const items = (Array.isArray(payload?.items) ? payload.items : []) as TopSearchResponseItem[]
        if (!cancelled) {
          setSearchTopTerms(
            items.map((item) => ({
              search_term: String(item.search_term ?? ''),
              views: Number(item.views ?? 0),
              watch_time_minutes: Number(item.watch_time_minutes ?? 0),
              video_count: Number(item.video_count ?? 0),
            })),
          )
        }
      } catch (err) {
        if (!cancelled) {
          setSearchTopTerms([])
          setSearchTopTermsError(err instanceof Error ? err.message : 'Failed to load top search terms.')
        }
      } finally {
        if (!cancelled) {
          setSearchTopTermsLoading(false)
        }
      }
    }
    loadTopSearchTerms()
    return () => {
      cancelled = true
    }
  }, [skip, videoId, range.start, range.end])

  return {
    trafficRows,
    previousTrafficRows,
    trafficLoading,
    trafficError,
    searchTopTerms,
    searchTopTermsLoading,
    searchTopTermsError,
  }
}

import { useState, useEffect } from 'react'

export type ChannelDailyRow = {
  day: string
  views?: number | null
  watch_time_minutes?: number | null
  estimated_revenue?: number | null
  ad_impressions?: number | null
  monetized_playbacks?: number | null
  cpm?: number | null
  subscribers_gained?: number | null
  subscribers_lost?: number | null
  engaged_views?: number | null
  average_view_duration_seconds?: number | null
}

export type ChannelTotals = {
  views?: number | null
  watch_time_minutes?: number | null
  estimated_revenue?: number | null
  ad_impressions?: number | null
  monetized_playbacks?: number | null
  cpm?: number | null
  subscribers_gained?: number | null
  subscribers_lost?: number | null
}

type DateRange = { start: string; end: string }

type Options = { skip?: boolean }

type UseChannelAnalyticsResult = {
  rows: ChannelDailyRow[]
  previousRows: ChannelDailyRow[]
  totals: ChannelTotals
  loading: boolean
  error: string | null
}

/**
 * Fetches channel-level daily analytics.
 * Uses channel-daily for contentType='all', or daily/summary?content_type=X otherwise.
 */
export function useChannelAnalytics(
  contentType: string,
  range: DateRange,
  previousRange: DateRange,
  options?: Options,
): UseChannelAnalyticsResult {
  const skip = options?.skip ?? false
  const [rows, setRows] = useState<ChannelDailyRow[]>([])
  const [previousRows, setPreviousRows] = useState<ChannelDailyRow[]>([])
  const [totals, setTotals] = useState<ChannelTotals>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (skip) {
      setRows([])
      setPreviousRows([])
      setTotals({})
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const buildUrl = (start: string, end: string) =>
          contentType === 'all'
            ? `http://localhost:8000/analytics/channel-daily?start_date=${start}&end_date=${end}`
            : `http://localhost:8000/analytics/daily/summary?start_date=${start}&end_date=${end}&content_type=${contentType}`
        const [currentRes, previousRes] = await Promise.all([
          fetch(buildUrl(range.start, range.end)),
          fetch(buildUrl(previousRange.start, previousRange.end)),
        ])
        if (!currentRes.ok || !previousRes.ok) {
          throw new Error(`Failed to load channel analytics (${!currentRes.ok ? currentRes.status : previousRes.status})`)
        }
        const [data, previousData] = await Promise.all([currentRes.json(), previousRes.json()])
        if (!cancelled) {
          setRows(Array.isArray(data.items) ? data.items : [])
          setPreviousRows(Array.isArray(previousData.items) ? previousData.items : [])
          setTotals(data.totals ?? {})
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load channel analytics.')
          setRows([])
          setPreviousRows([])
          setTotals({})
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, contentType, range.start, range.end, previousRange.start, previousRange.end])

  return { rows, previousRows, totals, loading, error }
}

import { useState, useEffect } from 'react'
import type { DateRange, ChannelDailyRow, ChannelTotals } from '../types'

export type { ChannelDailyRow, ChannelTotals }

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
            ? `http://localhost:8000/analytics/channel?start_date=${start}&end_date=${end}`
            : `http://localhost:8000/analytics/video/aggregate?start_date=${start}&end_date=${end}&content_type=${contentType}`
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
   
  }, [skip, contentType, range.start, range.end, previousRange.start, previousRange.end])

  return { rows, previousRows, totals, loading, error }
}

/** A single day row from a traffic sources API response */
export type TrafficSourceRow = {
  day: string
  traffic_source: string
  views: number
  watch_time_minutes: number
}

/** A single named series for a multi-line discovery chart */
export type DiscoveryMultiSeries = {
  key: string
  label: string
  color: string
  points: Array<{ date: string; value: number }>
}

const TRAFFIC_COLOR_PALETTE = ['#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#ef4444']

/**
 * Converts raw traffic-source daily rows into top-5 named series suitable for
 * a multi-line discovery chart. Zero-fills gaps within the date range.
 */
export function buildTrafficSeries(
  rows: TrafficSourceRow[],
  metric: 'views' | 'watch_time',
  startDate: string,
  endDate: string
): DiscoveryMultiSeries[] {
  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  const allDays: string[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    allDays.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  const totalsBySource = new Map<string, number>()
  rows.forEach((row) => {
    if (!row.traffic_source) {
      return
    }
    const value = metric === 'views' ? row.views : row.watch_time_minutes
    totalsBySource.set(row.traffic_source, (totalsBySource.get(row.traffic_source) ?? 0) + value)
  })

  const topSources = Array.from(totalsBySource.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([source]) => source)

  return topSources.map((source, index) => {
    const grouped = new Map<string, number>()
    rows.forEach((row) => {
      if (row.traffic_source !== source || !row.day) {
        return
      }
      const value = metric === 'views' ? row.views : row.watch_time_minutes
      grouped.set(row.day, (grouped.get(row.day) ?? 0) + value)
    })
    const points = allDays.map((date) => ({ date, value: grouped.get(date) ?? 0 }))
    return {
      key: source,
      label: source.replace(/_/g, ' '),
      color: TRAFFIC_COLOR_PALETTE[index % TRAFFIC_COLOR_PALETTE.length],
      points,
    }
  })
}

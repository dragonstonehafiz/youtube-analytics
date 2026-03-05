/**
 * Fetches available years from the channel-wide analytics API.
 * Use for Analytics and PlaylistDetail pages.
 */
export async function fetchChannelYears(): Promise<string[]> {
  const response = await fetch('http://localhost:8000/analytics/years')
  const data = await response.json()
  return Array.isArray(data.years) ? (data.years as string[]) : []
}

/**
 * Fetches available years for a specific video by examining its daily analytics rows.
 * Use for VideoDetail — derives the years this video actually has data for.
 */
export async function fetchVideoYears(videoId: string): Promise<string[]> {
  const response = await fetch(
    `http://localhost:8000/analytics/video-daily?video_id=${videoId}&limit=10000`
  )
  const data = await response.json()
  const items = Array.isArray(data.items) ? (data.items as { date?: string }[]) : []
  const sorted = items
    .filter((item) => typeof item.date === 'string')
    .sort((a, b) => (a.date as string).localeCompare(b.date as string))
  const minDate = sorted[0]?.date
  const maxDate = sorted[sorted.length - 1]?.date
  if (!minDate || !maxDate) return []
  const minYear = parseInt(minDate.slice(0, 4), 10)
  const maxYear = parseInt(maxDate.slice(0, 4), 10)
  return Array.from({ length: maxYear - minYear + 1 }, (_, idx) => String(maxYear - idx))
}

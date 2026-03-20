/**
 * Fetches available years from the channel-wide analytics API.
 * Use for Analytics and PlaylistDetail pages.
 */
export async function fetchChannelYears(): Promise<string[]> {
  const response = await fetch('http://localhost:8000/stats/years/channel')
  const data = await response.json()
  return Array.isArray(data.years) ? (data.years as string[]) : []
}

/**
 * Fetches available years for a specific video.
 * Use for VideoDetail — queries the database directly for year range.
 */
export async function fetchVideoYears(videoId: string): Promise<string[]> {
  const response = await fetch(
    `http://localhost:8000/stats/years/video?video_id=${videoId}`
  )
  const data = await response.json()
  return Array.isArray(data.years) ? (data.years as string[]) : []
}

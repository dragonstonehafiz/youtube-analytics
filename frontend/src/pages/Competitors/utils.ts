import type { Thumbnail, CompetitorVideoRow } from '@types'

type RelatedVideosResponse = { items?: unknown }

function toCompetitorVideos(payload: unknown): CompetitorVideoRow[] {
  const data = payload as RelatedVideosResponse
  return Array.isArray(data?.items) ? (data.items as CompetitorVideoRow[]) : []
}

export async function fetchCompetitorVideos(
  title: string,
  limit: number,
  contentType?: 'video' | 'short',
): Promise<CompetitorVideoRow[]> {
  const params = new URLSearchParams({ title, limit: String(limit) })
  if (contentType) params.set('content_type', contentType)
  const response = await fetch(`http://localhost:8000/channels/related-videos?${params.toString()}`)
  const data = await response.json()
  return toCompetitorVideos(data)
}

export async function fetchCompetitorVideoBuckets(
  title: string,
  includeShorts: boolean,
  numVideos: string | number = 24,
  numShorts: string | number = 10,
): Promise<{ videos: CompetitorVideoRow[]; shorts: CompetitorVideoRow[] }> {
  const videoLimit = typeof numVideos === 'string' ? parseInt(numVideos, 10) || 24 : numVideos
  const shortLimit = typeof numShorts === 'string' ? parseInt(numShorts, 10) || 10 : numShorts

  const videosPromise = fetchCompetitorVideos(title, videoLimit, 'video')
  const shortsPromise = includeShorts
    ? fetchCompetitorVideos(title, shortLimit, 'short')
    : Promise.resolve([] as CompetitorVideoRow[])
  const [videos, shorts] = await Promise.all([videosPromise, shortsPromise])
  return { videos, shorts }
}

export function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const current = shuffled[i]
    shuffled[i] = shuffled[j]
    shuffled[j] = current
  }
  return shuffled
}

export function insertThumbnailsAtRandom(
  videos: CompetitorVideoRow[],
  thumbnails: Thumbnail[],
  title: string,
): CompetitorVideoRow[] {
  const result = [...videos]
  thumbnails.forEach((thumbnail, index) => {
    const fakeVideo: CompetitorVideoRow = {
      id: `user-thumbnail-${index}`,
      title: title || 'Your Video',
      description: null,
      channel_title: 'Your Channel',
      published_at: new Date().toISOString(),
      views: 0,
      thumbnail_url: thumbnail.preview,
      content_type: undefined,
    }
    const randomIndex = Math.floor(Math.random() * (result.length + 1))
    result.splice(randomIndex, 0, fakeVideo)
  })
  return result
}

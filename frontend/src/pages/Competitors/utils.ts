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
  channelName: string = 'Your Channel',
  channelAvatarUrl: string | null = null,
): CompetitorVideoRow[] {
  const result = [...videos]
  thumbnails.forEach((thumbnail, index) => {
    const fakeVideo: CompetitorVideoRow = {
      id: `user-thumbnail-${index}`,
      title: title || 'Your Video',
      description: null,
      channel_title: channelName,
      channel_avatar_url: channelAvatarUrl,
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

export function formatCompactViewCount(views: number | null | undefined): string {
  const value = Math.max(0, Number(views ?? 0))
  if (value >= 1000000000) {
    return `${(value / 1000000000).toFixed(1).replace(/\.0$/, '')}B`
  }
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1).replace(/\.0$/, '')}M`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(0)}K`
  }
  return value.toLocaleString()
}

export function formatRelativeUploadAge(
  publishedAt: string | null | undefined,
  options: { short?: boolean } = {},
): string {
  if (!publishedAt) {
    return ''
  }
  const published = new Date(publishedAt)
  if (Number.isNaN(published.getTime())) {
    return ''
  }
  const now = new Date()
  const diffMs = Math.max(0, now.getTime() - published.getTime())
  const dayMs = 24 * 60 * 60 * 1000
  const days = Math.floor(diffMs / dayMs)
  const short = options.short === true

  if (days < 1) {
    return short ? 'today' : 'today'
  }
  if (days < 30) {
    return short ? `${days}d ago` : `${days} day${days === 1 ? '' : 's'} ago`
  }

  const months = Math.floor(days / 30)
  if (months < 12) {
    return short ? `${months}mo ago` : `${months} month${months === 1 ? '' : 's'} ago`
  }

  const years = Math.floor(days / 365)
  return short ? `${years}y ago` : `${years} year${years === 1 ? '' : 's'} ago`
}

import type { Thumbnail, CompetitorVideoRow } from './types'

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
      view_count: 0,
      thumbnail_url: thumbnail.preview,
      content_type: undefined,
    }
    const randomIndex = Math.floor(Math.random() * (result.length + 1))
    result.splice(randomIndex, 0, fakeVideo)
  })
  return result
}

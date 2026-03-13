import type { Thumbnail, CompetitorVideoRow } from './types'

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

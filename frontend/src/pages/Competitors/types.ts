export type Thumbnail = {
  id: string
  preview: string
  fileName: string
}

export type ThumbnailTabProps = {
  thumbnailTitle: string
  setThumbnailTitle: (title: string) => void
  thumbnails: Thumbnail[]
  setThumbnails: (thumbnails: Thumbnail[]) => void
}

export type CompetitorVideoRow = {
  id: string
  title: string
  description?: string | null
  channel_title: string | null
  published_at: string | null
  view_count: number | null
  thumbnail_url: string | null
  content_type?: string | null
}

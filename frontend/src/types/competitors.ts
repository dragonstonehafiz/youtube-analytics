export type Thumbnail = {
  id: string
  preview: string
  fileName: string
}

export type UserVideoSource = 'uploads' | 'playlist'

export type UserVideoSelectionMode = 'random' | 'percentile'

export type CompetitorVideoRow = {
  id: string
  title: string
  description?: string | null
  channel_title: string | null
  published_at: string | null
  views: number | null
  thumbnail_url: string | null
  content_type?: string | null
}

export type PlaylistMeta = {
  id: string
  title: string | null
  description: string | null
  published_at: string | null
  privacy_status: string | null
  item_count: number | null
  thumbnail_url: string | null
}

export type PlaylistAnalyticsTab = 'content' | 'comments' | 'metrics' | 'engagement' | 'monetization' | 'discovery' | 'insights'

export type PlaylistViewMode = 'playlist_views' | 'views'

export type PublishedDates = Record<string, {
  video_id?: string
  title: string
  published_at: string
  thumbnail_url: string
  content_type: string
}[]>

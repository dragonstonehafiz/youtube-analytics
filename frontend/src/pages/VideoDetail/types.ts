export type VideoMetadata = {
  id: string
  title: string
  description: string | null
  published_at: string | null
  views: number | null
  like_count: number | null
  comment_count: number | null
  privacy_status: string | null
  duration_seconds: number | null
  thumbnail_url: string | null
  content_type: string | null
}

export type VideoDailyRow = {
  date: string
  views: number | null
  watch_time_minutes: number | null
  average_view_duration_seconds: number | null
  estimated_revenue: number | null
  ad_impressions: number | null
  monetized_playbacks: number | null
  cpm: number | null
  subscribers_gained: number | null
  subscribers_lost: number | null
  engaged_views: number | null
}

export type DateRange = {
  start: string
  end: string
}

export type VideoDetailTab = 'metrics' | 'engagement' | 'monetization' | 'discovery' | 'comments'

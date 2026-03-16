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

export type VideoDetailTab = 'metrics' | 'engagement' | 'monetization' | 'discovery' | 'comments'

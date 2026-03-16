export type ChannelDailyRow = {
  day: string
  views?: number | null
  watch_time_minutes?: number | null
  estimated_revenue?: number | null
  ad_impressions?: number | null
  monetized_playbacks?: number | null
  cpm?: number | null
  subscribers_gained?: number | null
  subscribers_lost?: number | null
  engaged_views?: number | null
  average_view_duration_seconds?: number | null
}

export type ChannelTotals = {
  views?: number | null
  watch_time_minutes?: number | null
  estimated_revenue?: number | null
  ad_impressions?: number | null
  monetized_playbacks?: number | null
  cpm?: number | null
  subscribers_gained?: number | null
  subscribers_lost?: number | null
}

export type VideoDailyRow = {
  day: string
  views?: number | null
  watch_time_minutes?: number | null
  estimated_revenue?: number | null
  ad_impressions?: number | null
  monetized_playbacks?: number | null
  cpm?: number | null
  subscribers_gained?: number | null
  subscribers_lost?: number | null
  engaged_views?: number | null
  average_view_duration_seconds?: number | null
}

export type PlaylistDailyRow = {
  day: string
  views?: number | null
  watch_time_minutes?: number | null
  estimated_revenue?: number | null
  ad_impressions?: number | null
  monetized_playbacks?: number | null
  cpm?: number | null
  average_view_duration_seconds?: number | null
  playlist_starts?: number | null
  views_per_playlist_start?: number | null
  average_time_in_playlist_seconds?: number | null
  subscribers_gained?: number | null
  subscribers_lost?: number | null
}

export type PlaylistTotals = {
  views?: number | null
  watch_time_minutes?: number | null
  estimated_revenue?: number | null
  playlist_starts?: number | null
}

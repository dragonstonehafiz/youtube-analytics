import type { PlaylistAnalyticsTab } from './types'

export const PLAYLIST_DETAIL_TABS: { key: PlaylistAnalyticsTab; label: string }[] = [
  { key: 'metrics', label: 'Metrics' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'monetization', label: 'Monetization' },
  { key: 'discovery', label: 'Discovery' },
  { key: 'comments', label: 'Comments' },
  { key: 'insights', label: 'Insights' },
]

const VALID_TABS = new Set<string>(PLAYLIST_DETAIL_TABS.map((t) => t.key))

export function parsePlaylistDetailTab(value: string): PlaylistAnalyticsTab {
  return VALID_TABS.has(value) ? (value as PlaylistAnalyticsTab) : 'metrics'
}

export const VIEW_MODE_OPTIONS = [
  { label: 'Playlist Views', value: 'playlist_views' },
  { label: 'Video Views', value: 'views' },
]

import type { VideoDailyRow, VideoDetailTab } from '@types'

export const VIDEO_DETAIL_TABS: Array<{ key: VideoDetailTab; label: string }> = [
  { key: 'metrics', label: 'Metrics' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'monetization', label: 'Monetization' },
  { key: 'discovery', label: 'Discovery' },
  { key: 'comments', label: 'Comments' },
]

export const EMPTY_DATE_RANGE = { start: '', end: '' }

export function parseVideoDetailTab(value: string): VideoDetailTab {
  return VIDEO_DETAIL_TABS.some((tab) => tab.key === value)
    ? (value as VideoDetailTab)
    : 'metrics'
}

export function sortVideoDailyRows(rows: VideoDailyRow[]): VideoDailyRow[] {
  return [...rows]
    .filter((item) => typeof item.day === 'string')
    .sort((a, b) => a.day.localeCompare(b.day))
}

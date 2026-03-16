import type { ChannelDailyRow } from './analytics'
import type { PublishedItem } from '../components/charts'
import type { TrafficSourceRow } from '../utils/trafficSeries'

export type TabDataSource = {
  label: string
  dailyRows: ChannelDailyRow[]
  previousDailyRows: ChannelDailyRow[]
  videoIds: string[]
  totals?: Record<string, number | null>
  publishedDates?: Record<string, PublishedItem[]>
  contentType?: string
  playlistId?: string
}

export type DiscoveryDataSource = {
  label: string
  trafficRows: TrafficSourceRow[]
  previousTrafficRows: TrafficSourceRow[]
  videoIds: string[]
  publishedDates?: Record<string, PublishedItem[]>
  contentType?: string
  playlistId?: string
}

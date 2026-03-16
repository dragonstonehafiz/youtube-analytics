export type MonetizationContentType = 'video' | 'short'

export type MonetizationTopItem = {
  video_id: string
  title: string
  thumbnail_url: string
  revenue: number
}

export type MonetizationPerformance = {
  views: number
  estimated_revenue: number
  rpm: number
  items: MonetizationTopItem[]
}

export type MonetizationMonthly = {
  monthKey: string
  label: string
  amount: number
}

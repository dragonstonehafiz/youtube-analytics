import { useMemo } from 'react'
import { DonutChartCard, type DonutChartCardSegment } from '../../../primitives'
import { formatWholeNumber } from '../../../../../utils/number'

type TrafficSourceShareItem = {
  key: string
  label: string
  views: number
}

type TrafficSourceShareCardProps = {
  items: TrafficSourceShareItem[]
}

const PIE_COLORS = ['#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#ef4444', '#14b8a6', '#eab308']

function TrafficSourceShareCard({ items }: TrafficSourceShareCardProps) {
  const totalViews = items.reduce((sum, item) => sum + item.views, 0)

  const segments = useMemo<DonutChartCardSegment[]>(
    () =>
      items.map((item, index) => {
        const percent = totalViews > 0 ? (item.views / totalViews) * 100 : 0
        return {
          key: item.key,
          label: item.label,
          value: item.views,
          color: PIE_COLORS[index % PIE_COLORS.length],
          displayValue: `${percent.toFixed(1)}%`,
        }
      }),
    [items, totalViews]
  )

  return (
    <DonutChartCard
      title="Traffic source share"
      segments={segments}
      centerLabel="Total views"
      centerValue={formatWholeNumber(totalViews)}
      ariaLabel="Traffic source share by views"
      size={220}
    />
  )
}

export type { TrafficSourceShareItem }
export default TrafficSourceShareCard

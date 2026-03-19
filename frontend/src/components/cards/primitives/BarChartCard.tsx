import { BarChart, type BarChartBarInfo } from '@components/charts'

type BarChartCardProps = {
  data: number[]
  color?: string
  xAxisLabel?: string
  yAxisLabel?: string
  onBarClick?: (bar: BarChartBarInfo, x: number, y: number) => void
  onBarMouseEnter?: (bar: BarChartBarInfo, dataIndices: number[], event: React.MouseEvent<SVGRectElement>) => void
  onBarMouseLeave?: () => void
}

function BarChartCard({
  data,
  color = '#0ea5e9',
  xAxisLabel,
  yAxisLabel,
  onBarClick,
  onBarMouseEnter,
  onBarMouseLeave,
}: BarChartCardProps) {
  return (
    <BarChart
      data={data}
      color={color}
      fillWidth
      height={500}
      xAxisLabel={xAxisLabel}
      yAxisLabel={yAxisLabel}
      onBarClick={onBarClick}
      onBarMouseEnter={(bar, event) => onBarMouseEnter?.(bar, bar.dataIndices, event)}
      onBarMouseLeave={onBarMouseLeave}
    />
  )
}

export default BarChartCard

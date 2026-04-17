import { HistogramChart } from '@components/charts'

type HistogramChartCardProps = {
  viewData: number[]
  color?: string
  binCount?: number
  binSize?: number
  onBinMouseEnter?: (binIndex: number, dataIndices: number[], event: React.MouseEvent<SVGRectElement>) => void
  onBinMouseExit?: () => void
}

function HistogramChartCard({
  viewData,
  color = '#0ea5e9',
  binCount = 30,
  binSize,
  onBinMouseEnter,
  onBinMouseExit,
}: HistogramChartCardProps) {
  return (
    <HistogramChart
      data={viewData}
      color={color}
      binCount={binCount}
      binSize={binSize}
      fillWidth
      height={500}
      xAxisLabel="Views"
      yAxisLabel="Number of Videos"
      ariaLabel="Distribution of Video Views"
      onBinMouseEnter={onBinMouseEnter}
      onBinMouseExit={onBinMouseExit}
    />
  )
}

export default HistogramChartCard

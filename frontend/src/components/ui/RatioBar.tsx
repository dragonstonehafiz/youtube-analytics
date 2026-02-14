import './RatioBar.css'

type RatioBarProps = {
  length: number | string
  color: string
  ratio: number
}

function RatioBar({ length, color, ratio }: RatioBarProps) {
  const clampedRatio = Math.max(0, Math.min(100, ratio))
  const width = typeof length === 'number' ? `${length}px` : length

  return (
    <div className="ratio-bar" style={{ width }} aria-hidden="true">
      <div className="ratio-bar-fill" style={{ width: `${clampedRatio}%`, backgroundColor: color }} />
    </div>
  )
}

export type { RatioBarProps }
export default RatioBar

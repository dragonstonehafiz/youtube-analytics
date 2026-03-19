import './StatCard.css'

type StatSize = 'smaller' | 'small' | 'medium' | 'big' | 'bigger'

type StatCardProps = {
  label: React.ReactNode
  value: React.ReactNode
  sub?: React.ReactNode
  size?: StatSize
  hoverable?: boolean
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void
  onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void
}

function StatCard({ label, value, sub, size = 'medium', hoverable, onMouseEnter, onMouseLeave }: StatCardProps) {
  return (
    <div
      className={`stat-card stat-card-${size}${hoverable ? ' stat-card-hoverable' : ''}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
      {sub ? <div className="stat-card-sub">{sub}</div> : null}
    </div>
  )
}

export default StatCard

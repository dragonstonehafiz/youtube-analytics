import './MonetizationEarningsCard.css'

type MonetizationMonthly = {
  monthKey: string
  label: string
  amount: number
}

type MonetizationEarningsCardProps = {
  items: MonetizationMonthly[]
}

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function MonetizationEarningsCard({ items }: MonetizationEarningsCardProps) {
  const maxAmount = items.length > 0 ? Math.max(...items.map((entry) => entry.amount)) : 0

  return (
    <div className="earnings-card">
      <div className="earnings-card-title">How much you&apos;re earning</div>
      <div className="earnings-card-list">
        {items.map((item) => {
          const width = maxAmount > 0 ? `${Math.max(6, (item.amount / maxAmount) * 100)}%` : '0%'
          return (
            <div key={item.monthKey} className="earnings-card-row">
              <span>{item.label}</span>
              <div className="earnings-card-bar-wrap">
                <span className="earnings-card-bar" style={{ width }} />
              </div>
              <strong>${formatNumber(item.amount)}</strong>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default MonetizationEarningsCard

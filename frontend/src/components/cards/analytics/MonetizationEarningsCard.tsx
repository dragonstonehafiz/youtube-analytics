import { useEffect, useRef, useState } from 'react'
import { useHideMonetaryValues } from '@hooks/usePrivacyMode'
import './MonetizationEarningsCard.css'
import type { MonetizationMonthly } from '@types/monetization'
export type { MonetizationMonthly } from '@types/monetization'

type MonetizationEarningsCardProps = {
  items: MonetizationMonthly[]
}

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function MonetizationEarningsCard({ items }: MonetizationEarningsCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [cardWidth, setCardWidth] = useState(0)
  const hideMonetaryValues = useHideMonetaryValues()
  const maxAmount = items.length > 0 ? Math.max(...items.map((entry) => entry.amount)) : 0
  const MIN_VISIBLE_RATIO = 0.08
  const HIDE_BARS_WIDTH = 420
  const hideBarsForCompactWidth = cardWidth > 0 && cardWidth <= HIDE_BARS_WIDTH

  useEffect(() => {
    if (!cardRef.current) {
      return
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCardWidth(Math.floor(entry.contentRect.width))
      }
    })
    observer.observe(cardRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div className={hideBarsForCompactWidth ? 'earnings-card compact' : 'earnings-card'} ref={cardRef}>
      <div className="earnings-card-title">How much you&apos;re earning</div>
      <div className="earnings-card-list">
        {items.map((item) => {
          const ratio = maxAmount > 0 ? item.amount / maxAmount : 0
          const showBar = !hideBarsForCompactWidth && ratio >= MIN_VISIBLE_RATIO
          const width = `${Math.max(0, ratio * 100)}%`
          return (
            <div key={item.monthKey} className={showBar ? 'earnings-card-row' : 'earnings-card-row compact'}>
              <span>{item.label}</span>
              {showBar ? (
                <div className="earnings-card-bar-wrap">
                  <span className="earnings-card-bar" style={{ width }} />
                </div>
              ) : null}
              <strong>{hideMonetaryValues ? '••••••' : `$${formatNumber(item.amount)}`}</strong>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default MonetizationEarningsCard

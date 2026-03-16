import type { MonetizationMonthly } from '../types'

export function buildMonthlyEarnings(
  rows: { day: string; estimated_revenue?: number | null }[],
  maxMonths: number
): MonetizationMonthly[] {
  const monthTotals = new Map<string, number>()
  rows.forEach((r) => {
    if (!r.day || r.day.length < 7) return
    const monthKey = r.day.slice(0, 7)
    monthTotals.set(monthKey, (monthTotals.get(monthKey) ?? 0) + Number(r.estimated_revenue ?? 0))
  })
  return Array.from(monthTotals.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, maxMonths)
    .map(([monthKey, amount]) => {
      const [year, month] = monthKey.split('-')
      const dateValue = new Date(Date.UTC(Number(year), Number(month) - 1, 1))
      return {
        monthKey,
        label: dateValue.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        amount,
      }
    })
}

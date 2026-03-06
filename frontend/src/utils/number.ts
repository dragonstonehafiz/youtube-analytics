export function formatWholeNumber(value: number): string {
  return Number.isFinite(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : '-'
}

export function formatDecimalNumber(value: number, fractionDigits = 3): string {
  if (!Number.isFinite(value)) {
    return '-'
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
}

export function formatCurrency(value: number, fractionDigits = 3): string {
  if (!Number.isFinite(value)) {
    return '-'
  }
  return `$${formatDecimalNumber(value, fractionDigits)}`
}

export function formatSecondsAsTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

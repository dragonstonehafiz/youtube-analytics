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

export function formatDuration(seconds: number | null | undefined): string {
  const value = Number(seconds ?? 0)
  if (!Number.isFinite(value) || value <= 0) return '-'
  const rounded = Math.round(value)
  const hours = Math.floor(rounded / 3600)
  const mins = Math.floor((rounded % 3600) / 60)
  const secs = rounded % 60
  if (hours > 0) return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

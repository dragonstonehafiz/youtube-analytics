const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function formatYmdDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return value
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return value
  }
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`
}

export function formatDisplayDate(value: string | null | undefined): string {
  if (!value) {
    return '-'
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatYmdDate(value)
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  const year = parsed.getUTCFullYear()
  const month = parsed.getUTCMonth()
  const day = parsed.getUTCDate()
  return `${day} ${MONTH_NAMES[month]} ${year}`
}


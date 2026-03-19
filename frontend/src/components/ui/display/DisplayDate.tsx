import { formatDisplayDate } from '../../../utils/date'

interface DisplayDateProps {
  date: string | null | undefined
  fallback?: string
}

export default function DisplayDate({
  date,
  fallback = '—',
}: DisplayDateProps) {
  if (!date) {
    return <>{fallback}</>
  }
  return <>{formatDisplayDate(date)}</>
}

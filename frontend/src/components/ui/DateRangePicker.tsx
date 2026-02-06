import './DateRangePicker.css'

type DateRangePickerProps = {
  startDate: string
  endDate: string
  onChange: (startDate: string, endDate: string) => void
}

function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
  return (
    <div className="date-range">
      <input
        className="date-input"
        type="date"
        value={startDate}
        onChange={(event) => onChange(event.target.value, endDate)}
      />
      <span className="date-sep">→</span>
      <input
        className="date-input"
        type="date"
        value={endDate}
        onChange={(event) => onChange(startDate, event.target.value)}
      />
    </div>
  )
}

export default DateRangePicker

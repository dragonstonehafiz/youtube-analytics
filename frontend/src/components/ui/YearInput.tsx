import './YearInput.css'

type YearInputProps = {
  value: string
  onChange: (value: string) => void
}

function YearInput({ value, onChange }: YearInputProps) {
  return (
    <input
      className="year-input"
      type="text"
      inputMode="numeric"
      placeholder="YYYY"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

export default YearInput

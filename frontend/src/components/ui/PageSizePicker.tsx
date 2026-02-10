import Dropdown from './Dropdown'

type PageSizePickerProps = {
  value: number
  onChange: (value: number) => void
  options?: number[]
}

function PageSizePicker({ value, onChange, options = [10, 25, 50, 100] }: PageSizePickerProps) {
  return (
    <Dropdown
      value={String(value)}
      onChange={(next) => onChange(Number(next))}
      placeholder={String(value)}
      menuPlacement="top"
      items={options.map((option) => ({ type: 'option' as const, label: String(option), value: String(option) }))}
    />
  )
}

export default PageSizePicker

import { useMemo, useState } from 'react'
import './MultiSelect.css'

type MultiSelectItem = {
  label: string
  value: string
}

type MultiSelectProps = {
  items: MultiSelectItem[]
  selected: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}

function MultiSelect({ items, selected, onChange, placeholder = 'Select' }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const label = useMemo(() => {
    if (selected.length === 0) {
      return placeholder
    }
    if (selected.length === items.length) {
      return 'All Selected'
    }
    const selectedLabels = items
      .filter((entry) => selected.includes(entry.value))
      .map((entry) => entry.label)
    return selectedLabels.join(', ') || placeholder
  }, [items, selected, placeholder])

  const toggleValue = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value]
    )
  }

  return (
    <div className="multi-select">
      <button
        type="button"
        className="multi-select-trigger"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{label}</span>
        <span className="multi-select-caret">▾</span>
      </button>
      {open ? (
        <div className="multi-select-menu">
          {items.map((item) => (
            <label key={item.value} className="multi-select-item">
              <input
                type="checkbox"
                checked={selected.includes(item.value)}
                onChange={() => toggleValue(item.value)}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default MultiSelect

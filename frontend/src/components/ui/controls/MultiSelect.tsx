import { useEffect, useMemo, useRef, useState } from 'react'
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
  const containerRef = useRef<HTMLDivElement | null>(null)
  const label = useMemo(() => {
    if (selected.length === 0) {
      return placeholder
    }
    return `${selected.length} selected`
  }, [selected, placeholder])

  const toggleValue = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value]
    )
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current) {
        return
      }
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="multi-select" ref={containerRef}>
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

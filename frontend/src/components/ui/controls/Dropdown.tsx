import { useEffect, useRef, useState } from 'react'
import './Dropdown.css'

type DropdownItem =
  | { type: 'option'; label: string; value: string }
  | { type: 'divider' }

type DropdownProps = {
  label?: string
  items: DropdownItem[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  menuPlacement?: 'bottom' | 'top'
}

function Dropdown({ label, items, value, onChange, placeholder = 'Select', menuPlacement = 'bottom' }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const selectedLabel = items.find((item) => item.type === 'option' && item.value === value)
  const displayLabel = selectedLabel?.type === 'option' ? selectedLabel.label : placeholder

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
    <div className="dropdown-field" ref={containerRef}>
      {label ? <div className="dropdown-label">{label}</div> : null}
      <button className="dropdown-trigger" type="button" onClick={() => setOpen((prev) => !prev)}>
        <span>{displayLabel}</span>
        <span className="dropdown-caret">▾</span>
      </button>
      {open && (
        <div className={menuPlacement === 'top' ? 'dropdown-menu top' : 'dropdown-menu'}>
          {items.map((item, index) => {
            if (item.type === 'divider') {
              return <div key={`divider-${index}`} className="dropdown-divider" />
            }
            return (
              <button
                key={item.value}
                type="button"
                className={item.value === value ? 'dropdown-item active' : 'dropdown-item'}
                onClick={() => {
                  onChange(item.value)
                  setOpen(false)
                }}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Dropdown

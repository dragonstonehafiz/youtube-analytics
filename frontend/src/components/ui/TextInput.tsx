import './TextInput.css'

type TextInputProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disableNewlines?: boolean
  width?: number | string | null
  height?: number | string | null
  className?: string
}

function TextInput({
  value,
  onChange,
  placeholder = '',
  disableNewlines = false,
  width = null,
  height = null,
  className = '',
}: TextInputProps) {
  const style: React.CSSProperties = {
    width: width === null ? '100%' : width,
    height: height === null ? 'auto' : height,
  }

  const classes = ['text-input', className].filter(Boolean).join(' ')

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disableNewlines && e.key === 'Enter') {
      e.preventDefault()
    }
  }

  return (
    <input
      type="text"
      className={classes}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      style={style}
    />
  )
}

export default TextInput

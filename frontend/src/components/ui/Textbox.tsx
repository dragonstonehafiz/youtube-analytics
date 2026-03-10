import { useState } from 'react'
import './Textbox.css'

type TextboxProps = {
  value: string
  placeholder?: string
  width?: number | string | null
  height?: number | string | null
  className?: string
}

function Textbox({ value, placeholder = '', width = null, height = null, className = '' }: TextboxProps) {
  const [copied, setCopied] = useState(false)

  const style: React.CSSProperties = {
    width: width === null ? '100%' : width,
    height: height === null ? '100%' : height,
  }

  const classes = ['textbox', className].filter(Boolean).join(' ')

  const handleCopy = async () => {
    if (!value.trim()) {
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className={classes} style={style}>
      <button
        type="button"
        className={copied ? 'textbox-copy copied' : 'textbox-copy'}
        onClick={handleCopy}
        title={value.trim() ? (copied ? 'Copied' : 'Copy') : 'Copy'}
        aria-label="Copy text"
        disabled={!value.trim()}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
          <path d="M5 15V7a2 2 0 0 1 2-2h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      {!value.trim() ? (
        <div className="textbox-placeholder">{placeholder}</div>
      ) : (
        <div className="textbox-content">{value}</div>
      )}
    </div>
  )
}

export default Textbox

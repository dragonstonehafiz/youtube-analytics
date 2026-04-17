import { useState, useMemo } from 'react'
import './MarkdownTextbox.css'

type MarkdownTextboxProps = {
  value: string
  placeholder?: string
  width?: number | string | null
  height?: number | string | null
  className?: string
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function formatInlineMarkdown(input: string): string {
  let output = escapeHtml(input)
  output = output.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  output = output.replace(/`(.+?)`/g, '<code>$1</code>')
  return output
}

function MarkdownTextbox({ value, placeholder = '', width = null, height = null, className = '' }: MarkdownTextboxProps) {
  const [copied, setCopied] = useState(false)

  const renderedHtml = useMemo(() => {
    if (!value.trim()) return ''

    const lines = value.split(/\r?\n/)
    const htmlParts: string[] = []
    let inUnorderedList = false
    let inOrderedList = false

    const closeLists = () => {
      if (inUnorderedList) {
        htmlParts.push('</ul>')
        inUnorderedList = false
      }
      if (inOrderedList) {
        htmlParts.push('</ol>')
        inOrderedList = false
      }
    }

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        closeLists()
        continue
      }
      const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed)
      if (headingMatch) {
        closeLists()
        const level = headingMatch[1].length
        const content = formatInlineMarkdown(headingMatch[2])
        htmlParts.push(`<h${level}>${content}</h${level}>`)
        continue
      }
      const unorderedMatch = /^[-*]\s+(.+)$/.exec(trimmed)
      if (unorderedMatch) {
        if (inOrderedList) {
          htmlParts.push('</ol>')
          inOrderedList = false
        }
        if (!inUnorderedList) {
          htmlParts.push('<ul>')
          inUnorderedList = true
        }
        htmlParts.push(`<li>${formatInlineMarkdown(unorderedMatch[1])}</li>`)
        continue
      }
      const orderedMatch = /^\d+\.\s+(.+)$/.exec(trimmed)
      if (orderedMatch) {
        if (inUnorderedList) {
          htmlParts.push('</ul>')
          inUnorderedList = false
        }
        if (!inOrderedList) {
          htmlParts.push('<ol>')
          inOrderedList = true
        }
        htmlParts.push(`<li>${formatInlineMarkdown(orderedMatch[1])}</li>`)
        continue
      }
      closeLists()
      htmlParts.push(`<p>${formatInlineMarkdown(trimmed)}</p>`)
    }

    closeLists()
    return htmlParts.join('')
  }, [value])

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

  const style: React.CSSProperties = {
    width: width === null ? '100%' : width,
    height: height === null ? '100%' : height,
  }

  const classes = ['markdown-textbox', className].filter(Boolean).join(' ')

  return (
    <div className={classes} style={style}>
      <button
        type="button"
        className={copied ? 'markdown-textbox-copy copied' : 'markdown-textbox-copy'}
        onClick={handleCopy}
        title={value.trim() ? (copied ? 'Copied' : 'Copy markdown') : 'Copy markdown'}
        aria-label="Copy markdown"
        disabled={!value.trim()}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
          <path d="M5 15V7a2 2 0 0 1 2-2h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      {!value.trim() ? (
        <div className="markdown-textbox-placeholder">{placeholder}</div>
      ) : (
        <div className="markdown-textbox-content" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
      )}
    </div>
  )
}

export default MarkdownTextbox

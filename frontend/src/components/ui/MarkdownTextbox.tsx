import { useMemo } from 'react'
import './MarkdownTextbox.css'

type MarkdownTextboxProps = {
  value: string
  placeholder?: string
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

function MarkdownTextbox({ value, placeholder = '', className = '' }: MarkdownTextboxProps) {
  const renderedHtml = useMemo(() => {
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

  const classes = ['markdown-textbox', className].filter(Boolean).join(' ')
  if (!value.trim()) {
    return (
      <div className={classes}>
        <div className="markdown-textbox-placeholder">{placeholder}</div>
      </div>
    )
  }
  return <div className={classes} dangerouslySetInnerHTML={{ __html: renderedHtml }} />
}

export default MarkdownTextbox

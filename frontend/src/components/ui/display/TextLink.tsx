import { useNavigate } from 'react-router-dom'
import './TextLink.css'

interface TextLinkProps {
  text: string | null | undefined
  hideText?: boolean
  to?: string
  href?: string
  onClick?: () => void
  className?: string
}

export default function TextLink({
  text,
  hideText,
  to,
  href,
  onClick,
  className,
}: TextLinkProps) {
  const navigate = useNavigate()
  const displayText = hideText ? '••••••' : (text ?? '')
  const cls = ['text-link', className].filter(Boolean).join(' ')

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cls}
      >
        {displayText}
      </a>
    )
  }

  if (to || onClick) {
    return (
      <button
        type="button"
        className={cls}
        onClick={() => {
          if (onClick) {
            onClick()
          } else if (to) {
            navigate(to)
          }
        }}
      >
        {displayText}
      </button>
    )
  }

  return <span className={cls}>{displayText}</span>
}

import { useNavigate } from 'react-router-dom'
import { useHideVideoTitles } from '@hooks/usePrivacyMode'
import './DisplayVideoTitle.css'

interface DisplayVideoTitleProps {
  title: string | null | undefined
  videoId?: string
  className?: string
}

export default function DisplayVideoTitle({
  title,
  videoId,
  className,
}: DisplayVideoTitleProps) {
  const hideVideoTitles = useHideVideoTitles()
  const navigate = useNavigate()
  const displayText = hideVideoTitles ? '••••••' : (title ?? '')

  if (videoId) {
    return (
      <button
        type="button"
        className={className || 'video-title-button'}
        onClick={() => navigate(`/videos/${videoId}`)}
      >
        {displayText}
      </button>
    )
  }

  return <span className={className}>{displayText}</span>
}

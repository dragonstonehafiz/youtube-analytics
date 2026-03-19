import { useHideVideoThumbnails } from '../../../hooks/usePrivacyMode'
import './VideoThumbnail.css'

interface VideoThumbnailProps {
  url: string | null | undefined
  title?: string
  className?: string
}

export default function VideoThumbnail({
  url,
  title,
  className = 'video-thumb',
}: VideoThumbnailProps) {
  const hideVideoThumbnails = useHideVideoThumbnails()

  if (hideVideoThumbnails || !url) {
    return <div className={className} />
  }

  return (
    <img src={url} alt={title ?? ''} className={className} />
  )
}

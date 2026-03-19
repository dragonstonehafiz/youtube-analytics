import { useEffect, useMemo, useState } from 'react'

type ProfileImageProps = {
  src?: string | null
  name?: string | null
  className: string
  alt?: string
  youtubeAvatarSize?: number
  fallbackInitial?: string
}

function toInitial(value: string | null | undefined, fallback: string): string {
  if (!value || !value.trim()) {
    return fallback
  }
  const trimmed = value.trim()
  const withoutAt = trimmed.startsWith('@') ? trimmed.slice(1).trim() : trimmed
  if (!withoutAt) {
    return fallback
  }
  return withoutAt.charAt(0).toUpperCase()
}

function upscaleYouTubeAvatar(url: string, size: number): string {
  return url.replace(/\/s\d+(-[a-z0-9-]+)?\/photo\.jpg$/i, `/s${size}/photo.jpg`)
}

function ProfileImage({
  src,
  name,
  className,
  alt,
  youtubeAvatarSize = 0,
  fallbackInitial = '?',
}: ProfileImageProps) {
  const [failed, setFailed] = useState(false)
  const resolvedSrc = useMemo(() => {
    if (!src) {
      return null
    }
    if (youtubeAvatarSize > 0) {
      return upscaleYouTubeAvatar(src, youtubeAvatarSize)
    }
    return src
  }, [src, youtubeAvatarSize])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFailed(false)
  }, [resolvedSrc])

  if (resolvedSrc && !failed) {
    return <img className={className} src={resolvedSrc} alt={alt || name || 'Profile'} onError={() => setFailed(true)} />
  }

  return <div className={className}>{toInitial(name, fallbackInitial)}</div>
}

export default ProfileImage

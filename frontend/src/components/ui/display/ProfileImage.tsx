import { useEffect, useMemo, useState } from 'react'
import './ProfileImage.css'

type ProfileImageProps = {
  src?: string | null
  name?: string | null
  size?: number
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
  size = 34,
  fallbackInitial = '?',
}: ProfileImageProps) {
  const [failed, setFailed] = useState(false)
  const resolvedSrc = useMemo(() => {
    if (!src) {
      return null
    }
    return upscaleYouTubeAvatar(src, size)
  }, [src, size])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFailed(false)
  }, [resolvedSrc])

  const dynamicStyle = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.35),
  }

  if (resolvedSrc && !failed) {
    return (
      <img
        className="profile-image"
        style={dynamicStyle}
        src={resolvedSrc}
        alt={name || 'Profile'}
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <div className="profile-image" style={dynamicStyle}>
      {toInitial(name, fallbackInitial)}
    </div>
  )
}

export default ProfileImage

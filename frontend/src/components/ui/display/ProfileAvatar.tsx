import ProfileImage from './ProfileImage'

interface ProfileAvatarProps {
  src: string | null | undefined
  name?: string | null
  size?: number
  className?: string
}

export default function ProfileAvatar({
  src,
  name,
  size = 88,
  className,
}: ProfileAvatarProps) {
  return (
    <ProfileImage
      src={src}
      youtubeAvatarSize={size}
      name={name}
      className={className}
    />
  )
}

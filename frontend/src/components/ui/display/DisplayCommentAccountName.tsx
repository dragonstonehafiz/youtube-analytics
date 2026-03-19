import { formatHandle } from '@utils/handle'

interface DisplayCommentAccountNameProps {
  name: string | null | undefined
  className?: string
}

export default function DisplayCommentAccountName({
  name,
  className,
}: DisplayCommentAccountNameProps) {
  return <span className={className}>{formatHandle(name)}</span>
}

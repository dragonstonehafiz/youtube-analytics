import PlaylistItemsSection from './PlaylistItemsSection'

type Props = {
  playlistId: string | undefined
}

export default function ContentTab({ playlistId }: Props) {
  return <PlaylistItemsSection playlistId={playlistId} />
}

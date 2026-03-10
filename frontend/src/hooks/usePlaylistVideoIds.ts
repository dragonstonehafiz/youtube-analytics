import { useEffect, useState } from 'react'

export function usePlaylistVideoIds(playlistId: string | undefined): string[] {
  const [videoIds, setVideoIds] = useState<string[]>([])

  useEffect(() => {
    if (!playlistId) {
      setVideoIds([])
      return
    }
    fetch(`http://localhost:8000/playlists/${playlistId}/video-ids`)
      .then((res) => res.json())
      .then((data) => setVideoIds(Array.isArray(data.items) ? (data.items as string[]) : []))
      .catch(() => setVideoIds([]))
  }, [playlistId])

  return videoIds
}

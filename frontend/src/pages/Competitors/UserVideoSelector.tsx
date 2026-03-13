import { useCallback, useEffect, useState } from 'react'
import { ActionButton, Dropdown } from '../../components/ui'
import { PageCard } from '../../components/cards'
import { formatDisplayDate } from '../../utils/date'
import type { CompetitorVideoRow } from './types'
import './UserVideoSelector.css'

type Playlist = { id: string; title: string }
type Video = {
  id: string
  title: string
  views?: number
  channel_title?: string
  published_at?: string
  description?: string
  thumbnail_url?: string
  content_type?: string
}

type UserVideoSelectorProps = {
  selectedSource: 'uploads' | 'playlist'
  setSelectedSource: (source: 'uploads' | 'playlist') => void
  selectedPlaylist: string | null
  setSelectedPlaylist: (id: string | null) => void
  selectionMode: 'random' | 'percentile'
  setSelectionMode: (mode: 'random' | 'percentile') => void
  percentileRange: string
  setPercentileRange: (range: string) => void
  videoCount: string
  setVideoCount: (count: string) => void
  selectedVideos: CompetitorVideoRow[]
  onVideosSelected: (videos: CompetitorVideoRow[]) => void
}

function UserVideoSelector({
  selectedSource,
  setSelectedSource,
  selectedPlaylist,
  setSelectedPlaylist,
  selectionMode,
  setSelectionMode,
  percentileRange,
  setPercentileRange,
  videoCount,
  setVideoCount,
  selectedVideos,
  onVideosSelected,
}: UserVideoSelectorProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([])

  useEffect(() => {
    const loadPlaylists = async () => {
      try {
        const response = await fetch('http://localhost:8000/playlists?limit=100')
        const data = await response.json()
        if (Array.isArray(data.items)) {
          const sorted = [...data.items].sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))
          setPlaylists(sorted)
        }
      } catch (error) {
        console.error('Failed to load playlists', error)
      }
    }
    loadPlaylists()
  }, [])

  const selectVideos = useCallback(async () => {
    try {
      let videos: Video[] = []

      if (selectedSource === 'uploads') {
        const response = await fetch('http://localhost:8000/videos?limit=1000&sort=views&direction=desc')
        const data = await response.json()
        videos = Array.isArray(data.items) ? data.items : []
      } else if (selectedSource === 'playlist' && selectedPlaylist) {
        const response = await fetch(`http://localhost:8000/playlists/${selectedPlaylist}/items?limit=1000`)
        const data = await response.json()
        videos = Array.isArray(data.items) ? data.items : []
        console.log(videos[0])
      }

      if (videos.length === 0) {
        return
      }

      let candidateVideos = videos

      if (selectionMode === 'percentile') {
        const [minStr, maxStr] = percentileRange.split('-')
        const minPercentile = parseInt(minStr) / 100
        const maxPercentile = parseInt(maxStr) / 100

        // Sort in ascending order (lowest views first) so 0-10% = worst performers
        const sorted = [...videos].sort((a, b) => (a.views ?? 0) - (b.views ?? 0))
        const minIndex = Math.floor(sorted.length * minPercentile)
        const maxIndex = Math.ceil(sorted.length * maxPercentile)

        candidateVideos = sorted.slice(minIndex, maxIndex)
      }

      // Pick N random videos from candidates
      const count = Math.max(1, Math.min(parseInt(videoCount) || 3, candidateVideos.length))
      const chosen: Video[] = []
      const indices = new Set<number>()
      while (chosen.length < count && indices.size < Math.min(count, candidateVideos.length)) {
        const idx = Math.floor(Math.random() * candidateVideos.length)
        if (!indices.has(idx)) {
          indices.add(idx)
          chosen.push(candidateVideos[idx])
        }
      }

      // Convert to CompetitorVideoRow format
      const videoRows: CompetitorVideoRow[] = chosen.map((video) => ({
        id: video.id,
        title: video.title,
        views: video.views ?? null,
        channel_title: video.channel_title ?? null,
        published_at: video.published_at ?? null,
        description: video.description,
        thumbnail_url: video.thumbnail_url ?? null,
        content_type: video.content_type || 'video',
      }))

      onVideosSelected(videoRows)
    } catch (error) {
      console.error('Failed to select videos', error)
    }
  }, [selectedSource, selectedPlaylist, selectionMode, percentileRange, videoCount, onVideosSelected])

  useEffect(() => {
    if (selectedSource === 'playlist' && !selectedPlaylist) {
      return
    }
    void selectVideos()
  }, [selectedSource, selectedPlaylist, selectVideos])

  const percentileOptions: Array<{ label: string; value: string }> = [
    { label: '0-25%', value: '0-25' },
    { label: '25-50%', value: '25-50' },
    { label: '50-75%', value: '50-75' },
    { label: '75-100%', value: '75-100' },
  ]

  return (
    <PageCard>
      <div className="user-video-selector">
        <div className="user-video-selector-controls">
          {/* Source column */}
          <div className="user-video-selector-column">
            <label>Source</label>
            <div className="user-video-selector-buttons">
              <button
                type="button"
                className={selectedSource === 'uploads' ? 'user-video-button active' : 'user-video-button'}
                onClick={() => {
                  setSelectedSource('uploads')
                  setSelectedPlaylist(null)
                }}
              >
                All Uploads
              </button>
              <button
                type="button"
                className={selectedSource === 'playlist' ? 'user-video-button active' : 'user-video-button'}
                onClick={() => setSelectedSource('playlist')}
              >
                Playlist
              </button>
            </div>
            {selectedSource === 'playlist' && (
              <Dropdown
                items={playlists.map((p) => ({ type: 'option' as const, label: p.title, value: p.id }))}
                value={selectedPlaylist || ''}
                onChange={setSelectedPlaylist}
                placeholder="Choose playlist"
              />
            )}
          </div>

          {/* Selection column */}
          <div className="user-video-selector-column">
            <label>Selection</label>
            <div className="user-video-selector-buttons">
              <button
                type="button"
                className={selectionMode === 'random' ? 'user-video-button active' : 'user-video-button'}
                onClick={() => setSelectionMode('random')}
              >
                Random
              </button>
              <button
                type="button"
                className={selectionMode === 'percentile' ? 'user-video-button active' : 'user-video-button'}
                onClick={() => setSelectionMode('percentile')}
              >
                By Views
              </button>
            </div>
            {selectionMode === 'percentile' && (
              <Dropdown
                items={percentileOptions.map((opt) => ({ type: 'option' as const, label: opt.label, value: opt.value }))}
                value={percentileRange}
                onChange={setPercentileRange}
                placeholder="0-25%"
              />
            )}
          </div>

          {/* Count column */}
          <div className="user-video-selector-column">
            <label>Count</label>
            <Dropdown
              items={['1', '2', '3', '4', '5'].map((n: string) => ({ type: 'option' as const, label: n, value: n }))}
              value={videoCount}
              onChange={setVideoCount}
              placeholder="3"
            />
          </div>

          {/* Reload button */}
          <div className="user-video-selector-reload">
            <ActionButton label="Reload Videos" onClick={selectVideos} variant="primary" />
          </div>
        </div>

        {/* Selected videos display */}
        {selectedVideos.length > 0 && (
          <div className="user-video-selector-results">
            <div className="user-video-selector-results-label">Selected videos</div>
            <div className="user-video-selector-results-grid">
              {selectedVideos.map((video) => (
                  <div key={video.id} className="user-video-selector-result-card">
                  <div className="user-video-selector-result-image-wrapper">
                    {video.thumbnail_url ? (
                      <img src={video.thumbnail_url} alt={video.title} className="user-video-selector-result-image" />
                    ) : (
                      <div className="user-video-selector-result-image-placeholder" />
                    )}
                  </div>
                  <div className="user-video-selector-result-info">
                    <h3 className="user-video-selector-result-title">{video.title}</h3>
                    <div className="user-video-selector-result-metadata">
                      <span className="user-video-selector-result-channel">{video.channel_title ?? 'Unknown'}</span>
                      <div className="user-video-selector-result-stats">
                        <span>{(video.views ?? 0).toLocaleString()} views</span>
                        <span>•</span>
                        <span>{formatDisplayDate(video.published_at)}</span>
                      </div>
                    </div>
                  </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </PageCard>
  )
}

export default UserVideoSelector

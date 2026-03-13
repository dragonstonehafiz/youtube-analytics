import { useEffect, useState } from 'react'
import { getStored, setStored } from '../../utils/storage'
import CompetitorVideosTab from './CompetitorVideosTab'
import TestThumbnailHomeTab from './TestThumbnailHomeTab'
import TestThumbnailSearchTab from './TestThumbnailSearchTab'
import TestThumbnailVideoPlayerTab from './TestThumbnailVideoPlayerTab'
import type { Thumbnail } from './types'
import '../shared.css'
import '../Videos/Videos.css'
import './Competitors.css'

type CompetitorsTab = 'videos' | 'thumbnail-home' | 'thumbnail-search' | 'thumbnail-player'

function Competitors() {
  const initialTab = getStored('competitorsTab', 'videos') as string
  const [tab, setTab] = useState<CompetitorsTab>(
    (['videos', 'thumbnail-home', 'thumbnail-search', 'thumbnail-player'] as string[]).includes(initialTab) ? (initialTab as CompetitorsTab) : 'videos'
  )
  const [thumbnailTitle, setThumbnailTitle] = useState(getStored('thumbnailTitle', ''))
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>(JSON.parse(getStored('thumbnails', '[]') as string))

  const handleTabChange = (newTab: CompetitorsTab) => {
    setTab(newTab)
    setStored('competitorsTab', newTab)
  }

  useEffect(() => {
    setStored('thumbnailTitle', thumbnailTitle)
  }, [thumbnailTitle])

  useEffect(() => {
    setStored('thumbnails', JSON.stringify(thumbnails))
  }, [thumbnails])

  return (
    <section className="page">
      <header className="page-header">
        <h1>Competitors</h1>
      </header>
      <div className="competitors-tab-row">
        <button
          type="button"
          className={tab === 'videos' ? 'competitors-tab active' : 'competitors-tab'}
          onClick={() => handleTabChange('videos')}
        >
          Videos List
        </button>
        <button
          type="button"
          className={tab === 'thumbnail-home' ? 'competitors-tab active' : 'competitors-tab'}
          onClick={() => handleTabChange('thumbnail-home')}
        >
          Thumbnail Test (Home Page)
        </button>
        <button
          type="button"
          className={tab === 'thumbnail-search' ? 'competitors-tab active' : 'competitors-tab'}
          onClick={() => handleTabChange('thumbnail-search')}
        >
          Thumbnail Test (Search)
        </button>
        <button
          type="button"
          className={tab === 'thumbnail-player' ? 'competitors-tab active' : 'competitors-tab'}
          onClick={() => handleTabChange('thumbnail-player')}
        >
          Thumbnail Test (Video Player)
        </button>
      </div>
      {tab === 'videos' && <CompetitorVideosTab />}
      {tab === 'thumbnail-home' && (
        <TestThumbnailHomeTab
          thumbnailTitle={thumbnailTitle}
          setThumbnailTitle={setThumbnailTitle}
          thumbnails={thumbnails}
          setThumbnails={setThumbnails}
        />
      )}
      {tab === 'thumbnail-search' && (
        <TestThumbnailSearchTab
          thumbnailTitle={thumbnailTitle}
          setThumbnailTitle={setThumbnailTitle}
          thumbnails={thumbnails}
          setThumbnails={setThumbnails}
        />
      )}
      {tab === 'thumbnail-player' && (
        <TestThumbnailVideoPlayerTab
          thumbnailTitle={thumbnailTitle}
          setThumbnailTitle={setThumbnailTitle}
          thumbnails={thumbnails}
          setThumbnails={setThumbnails}
        />
      )}
    </section>
  )
}

export default Competitors

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

const TAB_OPTIONS: Array<{ key: CompetitorsTab; label: string }> = [
  { key: 'videos', label: 'Videos List' },
  { key: 'thumbnail-home', label: 'Thumbnail Test (Home Page)' },
  { key: 'thumbnail-search', label: 'Thumbnail Test (Search)' },
  { key: 'thumbnail-player', label: 'Thumbnail Test (Video Player)' },
]

const VALID_TABS: CompetitorsTab[] = TAB_OPTIONS.map((option) => option.key)

function Competitors() {
  const initialTab = getStored('competitorsTab', 'videos') as string
  const [tab, setTab] = useState<CompetitorsTab>(
    VALID_TABS.includes(initialTab as CompetitorsTab) ? (initialTab as CompetitorsTab) : 'videos',
  )

  const handleTabChange = (newTab: CompetitorsTab) => {
    setTab(newTab)
    setStored('competitorsTab', newTab)
  }


  return (
    <section className="page">
      <header className="page-header">
        <h1>Competitors</h1>
      </header>
      <div className="competitors-tab-row">
        {TAB_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            className={tab === option.key ? 'competitors-tab active' : 'competitors-tab'}
            onClick={() => handleTabChange(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {tab === 'videos' && <CompetitorVideosTab />}
      {tab === 'thumbnail-home' && <TestThumbnailHomeTab />}
      {tab === 'thumbnail-search' && <TestThumbnailSearchTab />}
      {tab === 'thumbnail-player' && <TestThumbnailVideoPlayerTab />}
    </section>
  )
}

export default Competitors

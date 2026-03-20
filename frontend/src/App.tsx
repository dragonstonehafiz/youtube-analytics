import { useState } from 'react'
import './App.css'
import { Route, Routes } from 'react-router-dom'
import { Sidebar } from '@components/ui'
import Analytics from '@pages/Analytics'
import Audience from '@pages/Audience'
import AudienceDetail from '@pages/AudienceDetail'
import Comments from '@pages/Comments'
import Dashboard from '@pages/Dashboard'
import Settings from '@pages/Settings'
import PlaylistDetail from '@pages/PlaylistDetail'
import Playlists from '@pages/Playlists'
import SyncSettings from '@pages/SyncSettings'
import VideoDetail from '@pages/VideoDetail'
import Competitors from '@pages/Competitors'
import Videos from '@pages/Videos'

function App() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  return (
    <div className="app">
      <Sidebar isCollapsed={isSidebarCollapsed} onToggle={setIsSidebarCollapsed} />
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/videos" element={<Videos />} />
          <Route path="/competitors" element={<Competitors />} />
          <Route path="/playlists" element={<Playlists />} />
          <Route path="/playlists/:playlistId" element={<PlaylistDetail />} />
          <Route path="/comments" element={<Comments />} />
          <Route path="/audience" element={<Audience />} />
          <Route path="/audience/:channelId" element={<AudienceDetail />} />
          <Route path="/videos/:videoId" element={<VideoDetail />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/sync" element={<SyncSettings />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}

export default App

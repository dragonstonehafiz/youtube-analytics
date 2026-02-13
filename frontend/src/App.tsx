import { useState } from 'react'
import './App.css'
import { NavLink, Route, Routes } from 'react-router-dom'
import { ActionButton } from './components/ui'
import Analytics from './pages/Analytics'
import Audience from './pages/Audience'
import AudienceDetail from './pages/AudienceDetail'
import Comments from './pages/Comments'
import Dashboard from './pages/Dashboard'
import PlaylistDetail from './pages/PlaylistDetail'
import Playlists from './pages/Playlists'
import SyncSettings from './pages/SyncSettings'
import VideoDetail from './pages/VideoDetail'
import Videos from './pages/Videos'

function App() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  return (
    <div className={isSidebarCollapsed ? 'app sidebar-collapsed' : 'app'}>
      {isSidebarCollapsed ? (
        <ActionButton
          label=">"
          onClick={() => setIsSidebarCollapsed(false)}
          variant="soft"
          bordered={false}
          className="sidebar-toggle-collapsed"
          title="Expand sidebar"
        />
      ) : null}
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand">YouTube Analytics</div>
          <ActionButton
            label="<"
            onClick={() => setIsSidebarCollapsed(true)}
            variant="soft"
            bordered={false}
            className="brand-collapse-toggle"
            title="Collapse sidebar"
          />
        </div>
        <nav className="nav">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/videos">Videos</NavLink>
          <NavLink to="/playlists">Playlists</NavLink>
          <NavLink to="/comments">Comments</NavLink>
          <NavLink to="/audience">Audience</NavLink>
          <NavLink to="/analytics">Analytics</NavLink>
          <NavLink to="/sync">Sync</NavLink>
        </nav>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/videos" element={<Videos />} />
          <Route path="/playlists" element={<Playlists />} />
          <Route path="/playlists/:playlistId" element={<PlaylistDetail />} />
          <Route path="/comments" element={<Comments />} />
          <Route path="/audience" element={<Audience />} />
          <Route path="/audience/:channelId" element={<AudienceDetail />} />
          <Route path="/videos/:videoId" element={<VideoDetail />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/sync" element={<SyncSettings />} />
        </Routes>
      </main>
    </div>
  )
}

export default App

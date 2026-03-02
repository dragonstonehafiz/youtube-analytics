import { useState } from 'react'
import './App.css'
import { NavLink, Route, Routes } from 'react-router-dom'
import Analytics from './pages/Analytics'
import Audience from './pages/Audience'
import AudienceDetail from './pages/AudienceDetail'
import Comments from './pages/Comments'
import Dashboard from './pages/Dashboard'
import LLMSettings from './pages/LLMSettings'
import PlaylistDetail from './pages/PlaylistDetail'
import Playlists from './pages/Playlists'
import SyncSettings from './pages/SyncSettings'
import VideoDetail from './pages/VideoDetail'
import Videos from './pages/Videos'
import AnalyticsIcon from './assets/analytics.svg?react'
import AudienceIcon from './assets/audience.svg?react'
import CommentsIcon from './assets/comments.svg?react'
import DashboardIcon from './assets/dashboard.svg?react'
import LlmIcon from './assets/llm.svg?react'
import PlaylistIcon from './assets/playlist.svg?react'
import SidebarCloseIcon from './assets/sidebar-close.svg?react'
import SidebarOpenIcon from './assets/sidebar-open.svg?react'
import SyncIcon from './assets/sync.svg?react'
import VideosIcon from './assets/videos.svg?react'

function App() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  return (
    <div className={isSidebarCollapsed ? 'app sidebar-collapsed' : 'app'}>
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand">YouTube Analytics</div>
          <button
            className="sidebar-toggle"
            onClick={() => setIsSidebarCollapsed(true)}
            title="Collapse sidebar"
          >
            <SidebarCloseIcon />
          </button>
        </div>
        <div className="sidebar-toggle-row">
          <button
            className="sidebar-toggle"
            onClick={() => setIsSidebarCollapsed(false)}
            title="Expand sidebar"
          >
            <SidebarOpenIcon />
          </button>
        </div>
        <nav className="nav">
          <NavLink to="/" end>
            <DashboardIcon className="nav-icon" />
            <span className="nav-label">Dashboard</span>
          </NavLink>
          <NavLink to="/videos">
            <VideosIcon className="nav-icon" />
            <span className="nav-label">Videos</span>
          </NavLink>
          <NavLink to="/playlists">
            <PlaylistIcon className="nav-icon" />
            <span className="nav-label">Playlists</span>
          </NavLink>
          <NavLink to="/comments">
            <CommentsIcon className="nav-icon" />
            <span className="nav-label">Comments</span>
          </NavLink>
          <NavLink to="/audience">
            <AudienceIcon className="nav-icon" />
            <span className="nav-label">Audience</span>
          </NavLink>
          <NavLink to="/analytics">
            <AnalyticsIcon className="nav-icon" />
            <span className="nav-label">Analytics</span>
          </NavLink>
          <NavLink to="/sync">
            <SyncIcon className="nav-icon" />
            <span className="nav-label">Sync</span>
          </NavLink>
          <NavLink to="/llm-settings">
            <LlmIcon className="nav-icon" />
            <span className="nav-label">LLM Settings</span>
          </NavLink>
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
          <Route path="/llm-settings" element={<LLMSettings />} />
        </Routes>
      </main>
    </div>
  )
}

export default App

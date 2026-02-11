import './App.css'
import { NavLink, Route, Routes } from 'react-router-dom'
import Analytics from './pages/Analytics'
import Comments from './pages/Comments'
import Dashboard from './pages/Dashboard'
import PlaylistDetail from './pages/PlaylistDetail'
import Playlists from './pages/Playlists'
import SyncSettings from './pages/SyncSettings'
import VideoDetail from './pages/VideoDetail'
import Videos from './pages/Videos'

function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">YouTube Analytics</div>
        <nav className="nav">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/videos">Videos</NavLink>
          <NavLink to="/playlists">Playlists</NavLink>
          <NavLink to="/comments">Comments</NavLink>
          <NavLink to="/analytics">Analytics</NavLink>
          <NavLink to="/sync">Sync</NavLink>
        </nav>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/videos" element={<Videos />} />
          <Route path="/playlists" element={<Playlists />} />
          <Route path="/playlistDetails/:playlistId" element={<PlaylistDetail />} />
          <Route path="/comments" element={<Comments />} />
          <Route path="/videoDetails/:videoId" element={<VideoDetail />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/sync" element={<SyncSettings />} />
        </Routes>
      </main>
    </div>
  )
}

export default App

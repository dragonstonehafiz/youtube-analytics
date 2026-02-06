import './App.css'
import { NavLink, Route, Routes } from 'react-router-dom'
import Analytics from './pages/Analytics'
import Dashboard from './pages/Dashboard'
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
          <NavLink to="/analytics">Analytics</NavLink>
          <NavLink to="/sync">Sync & Settings</NavLink>
        </nav>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/videos" element={<Videos />} />
          <Route path="/videos/:videoId" element={<VideoDetail />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/sync" element={<SyncSettings />} />
        </Routes>
      </main>
    </div>
  )
}

export default App

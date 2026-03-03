import './Sidebar.css'
import { NavLink } from 'react-router-dom'
import AnalyticsIcon from '../../assets/analytics.svg?react'
import AudienceIcon from '../../assets/audience.svg?react'
import CommentsIcon from '../../assets/comments.svg?react'
import DashboardIcon from '../../assets/dashboard.svg?react'
import LlmIcon from '../../assets/llm.svg?react'
import PlaylistIcon from '../../assets/playlist.svg?react'
import SidebarCloseIcon from '../../assets/sidebar-close.svg?react'
import SidebarOpenIcon from '../../assets/sidebar-open.svg?react'
import SyncIcon from '../../assets/sync.svg?react'
import VideosIcon from '../../assets/videos.svg?react'

interface SidebarProps {
  isCollapsed: boolean
  onToggle: (collapsed: boolean) => void
}

export default function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  return (
    <aside className={isCollapsed ? 'sidebar collapsed' : 'sidebar'}>
      <div className="brand-row">
        <div className="brand">YouTube Analytics</div>
        <button
          className="sidebar-toggle"
          onClick={() => onToggle(true)}
          title="Collapse sidebar"
        >
          <SidebarCloseIcon />
        </button>
      </div>
      <div className="sidebar-toggle-row">
        <button
          className="sidebar-toggle"
          onClick={() => onToggle(false)}
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
  )
}

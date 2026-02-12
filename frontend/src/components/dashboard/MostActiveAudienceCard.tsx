import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ActionButton, ProfileImage } from '../ui'
import './MostActiveAudienceCard.css'

type ActiveAudienceItem = {
  channel_id: string
  display_name: string
  profile_image_url: string
  is_public_subscriber: number
  comments_count: number
  likes_count: number
  replies_count: number
}

function MostActiveAudienceCard() {
  const navigate = useNavigate()
  const [items, setItems] = useState<ActiveAudienceItem[]>([])

  useEffect(() => {
    async function loadActiveAudience() {
      try {
        const response = await fetch('http://127.0.0.1:8000/audience/active?days=90&limit=5')
        const data = await response.json()
        const mapped = (Array.isArray(data?.items) ? data.items : []).map((item: any) => ({
          channel_id: String(item.channel_id ?? ''),
          display_name: String(item.display_name ?? '@Unknown'),
          profile_image_url: String(item.profile_image_url ?? ''),
          is_public_subscriber: Number(item.is_public_subscriber ?? 0),
          comments_count: Number(item.comments_count ?? 0),
          likes_count: Number(item.likes_count ?? 0),
          replies_count: Number(item.replies_count ?? 0),
        }))
        setItems(mapped)
      } catch (error) {
        console.error('Failed to load most active audience', error)
        setItems([])
      }
    }

    loadActiveAudience()
  }, [])

  return (
    <section className="dashboard-active-audience-card">
      <div className="dashboard-active-audience-header">
        <h2 className="dashboard-active-audience-title">Most active community members</h2>
      </div>
      {items.length === 0 ? (
        <div className="dashboard-active-audience-empty">No active members in this period</div>
      ) : (
        <div className="dashboard-active-audience-list">
          {items.map((item) => (
            <article key={item.channel_id} className="dashboard-active-audience-item">
              <div className="dashboard-active-audience-main">
                <ProfileImage
                  className="dashboard-active-audience-avatar"
                  src={item.profile_image_url}
                  name={item.display_name}
                  fallbackInitial="U"
                  youtubeAvatarSize={88}
                />
                <div className="dashboard-active-audience-content">
                  <Link to={`/audience/${encodeURIComponent(item.channel_id)}`} className="dashboard-active-audience-name">
                    {item.display_name || '@Unknown'}
                  </Link>
                  <div className="dashboard-active-audience-meta">
                    <span>{item.comments_count.toLocaleString()} comments</span>
                    <span>{item.likes_count.toLocaleString()} likes</span>
                    <span>{item.replies_count.toLocaleString()} replies</span>
                  </div>
                </div>
              </div>
              <span className={item.is_public_subscriber ? 'dashboard-active-audience-badge yes' : 'dashboard-active-audience-badge no'}>
                {item.is_public_subscriber ? 'Subscriber' : 'Commenter'}
              </span>
            </article>
          ))}
        </div>
      )}
      <ActionButton label="View audience" variant="soft" onClick={() => navigate('/audience')} />
    </section>
  )
}

export default MostActiveAudienceCard

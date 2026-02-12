import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { VideoDetailListCard } from '../components/analytics'
import { ChannelAnalyticsCard, CommentsPreviewCard } from '../components/dashboard'
import { PageCard } from '../components/layout'
import './Page.css'

type VideoDetailListItem = {
  video_id: string
  title: string
  thumbnail_url: string
  published_at: string
  views: number
  watch_time_minutes: number
  avg_view_duration_seconds: number
  avg_view_pct: number
}

function Dashboard() {
  const navigate = useNavigate()
  const [latestLongform, setLatestLongform] = useState<VideoDetailListItem[]>([])
  const [latestShorts, setLatestShorts] = useState<VideoDetailListItem[]>([])

  useEffect(() => {
    async function loadLatestCards() {
      try {
        const today = new Date().toISOString().slice(0, 10)
        const [longformResponse, shortResponse] = await Promise.all([
          fetch(
            `http://127.0.0.1:8000/analytics/top-content?start_date=2000-01-01&end_date=${today}&limit=10&content_type=video&sort_by=published_at&direction=desc&privacy_status=public`
          ),
          fetch(
            `http://127.0.0.1:8000/analytics/top-content?start_date=2000-01-01&end_date=${today}&limit=10&content_type=short&sort_by=published_at&direction=desc&privacy_status=public`
          ),
        ])
        const [longformData, shortData] = await Promise.all([longformResponse.json(), shortResponse.json()])
        const mapItems = (payload: any): VideoDetailListItem[] =>
          (Array.isArray(payload?.items) ? payload.items : []).map((item: any) => ({
            video_id: String(item.video_id ?? ''),
            title: String(item.title ?? '(untitled)'),
            thumbnail_url: String(item.thumbnail_url ?? ''),
            published_at: String(item.published_at ?? ''),
            views: Number(item.views ?? 0),
            watch_time_minutes: Number(item.watch_time_minutes ?? 0),
            avg_view_duration_seconds: Number(item.avg_view_duration_seconds ?? 0),
            avg_view_pct: Number(item.avg_view_pct ?? 0),
          }))
        setLatestLongform(mapItems(longformData))
        setLatestShorts(mapItems(shortData))
      } catch (error) {
        console.error('Failed to load dashboard latest videos', error)
        setLatestLongform([])
        setLatestShorts([])
      }
    }

    loadLatestCards()
  }, [])

  return (
    <section className="page">
      <header className="page-header">
        <h1>Dashboard</h1>
      </header>
      <div className="page-body">
        <div className="page-row dashboard-row">
          <PageCard>
            <ChannelAnalyticsCard />
          </PageCard>
          <PageCard>
            <CommentsPreviewCard />
          </PageCard>
        </div>
        <div className="page-row dashboard-row">
          <PageCard>
            <VideoDetailListCard
              title="Latest longform content"
              items={latestLongform}
              onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
            />
          </PageCard>
          <PageCard>
            <VideoDetailListCard
              title="Latest shortform content"
              items={latestShorts}
              onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
            />
          </PageCard>
        </div>
      </div>
    </section>
  )
}

export default Dashboard

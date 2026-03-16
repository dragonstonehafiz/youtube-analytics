import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChannelAnalyticsCard,
  CommentsPreviewCard,
  MostActiveAudienceCard,
  PageCard,
  TrafficSourceShareCard,
  VideoDetailListCard,
  type TrafficSourceShareItem,
} from '../../components/cards'
import '../shared.css'
import './Dashboard.css'

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
  const [trafficShareItems, setTrafficShareItems] = useState<TrafficSourceShareItem[]>([])

  useEffect(() => {
    async function loadLatestCards() {
      try {
        const today = new Date().toISOString().slice(0, 10)
        const ninetyDaysAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        const [longformResponse, shortResponse, trafficResponse] = await Promise.all([
          fetch(
            `http://localhost:8000/analytics/top-content?start_date=2000-01-01&end_date=${today}&limit=10&content_type=video&sort_by=published_at&direction=desc&privacy_status=public`
          ),
          fetch(
            `http://localhost:8000/analytics/top-content?start_date=2000-01-01&end_date=${today}&limit=10&content_type=short&sort_by=published_at&direction=desc&privacy_status=public`
          ),
          fetch(`http://localhost:8000/analytics/traffic-sources?start_date=${ninetyDaysAgo}&end_date=${today}`),
        ])
        const [longformData, shortData, trafficData] = await Promise.all([
          longformResponse.json(),
          shortResponse.json(),
          trafficResponse.json(),
        ])
        const mapItems = (payload: unknown): VideoDetailListItem[] =>
          (Array.isArray((payload as Record<string, unknown>)?.items) ? (payload as Record<string, unknown>).items as unknown[] : []).map((item: unknown) => ({
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
        const rows: Array<{ traffic_source: string; views: number }> = Array.isArray(trafficData?.items) ? trafficData.items : []
        const totals = new Map<string, number>()
        rows.forEach((row) => {
          if (!row.traffic_source) return
          totals.set(row.traffic_source, (totals.get(row.traffic_source) ?? 0) + (row.views ?? 0))
        })
        setTrafficShareItems(
          Array.from(totals.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 7)
            .map(([source, views]) => ({ key: source, label: source.replace(/_/g, ' '), views }))
        )
      } catch (error) {
        console.error('Failed to load dashboard latest videos', error)
        setLatestLongform([])
        setLatestShorts([])
        setTrafficShareItems([])
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
          <PageCard>
            <MostActiveAudienceCard />
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
          <PageCard>
            <TrafficSourceShareCard items={trafficShareItems} />
          </PageCard>
        </div>
      </div>
    </section>
  )
}

export default Dashboard

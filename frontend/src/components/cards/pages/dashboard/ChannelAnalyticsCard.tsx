import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActionButton } from '../../../ui'
import { useHideMonetaryValues } from '../../../../hooks/usePrivacyMode'
import './ChannelAnalyticsCard.css'

type ChannelSummary = {
  subscribers: number | null
  subscriberDelta: number
  views: number
  watchHours: number
  revenue: number
  viewsTrend: 'up' | 'down' | 'flat'
  watchTrend: 'up' | 'down' | 'flat'
  revenueTrend: 'up' | 'down' | 'flat'
}

function trendForDelta(delta: number): 'up' | 'down' | 'flat' {
  if (delta > 0) {
    return 'up'
  }
  if (delta < 0) {
    return 'down'
  }
  return 'flat'
}

function ChannelAnalyticsCard() {
  const navigate = useNavigate()
  const hideMonetaryValues = useHideMonetaryValues()
  const [summary, setSummary] = useState<ChannelSummary>({
    subscribers: null,
    subscriberDelta: 0,
    views: 0,
    watchHours: 0,
    revenue: 0,
    viewsTrend: 'flat',
    watchTrend: 'flat',
    revenueTrend: 'flat',
  })

  useEffect(() => {
    async function loadChannelSummary() {
      try {
        const now = new Date()
        const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
        const format = (value: Date) => value.toISOString().slice(0, 10)
        const currentStart = new Date(today)
        currentStart.setUTCDate(currentStart.getUTCDate() - 27)
        const previousEnd = new Date(currentStart)
        previousEnd.setUTCDate(previousEnd.getUTCDate() - 1)
        const previousStart = new Date(previousEnd)
        previousStart.setUTCDate(previousStart.getUTCDate() - 27)
        const response = await fetch(
            `http://localhost:8000/analytics/channel-card-summary` +
            `?current_start=${format(currentStart)}&current_end=${format(today)}` +
            `&previous_start=${format(previousStart)}&previous_end=${format(previousEnd)}`
          )
        const data = await response.json()
        const lifetimeSubscribers = Number(data?.subscribers_net ?? 0)
        const currentTotals = data?.current ?? {}
        const previousTotals = data?.previous ?? {}
        const currentViews = Number(currentTotals.views ?? 0)
        const currentWatchHours = Math.round(Number(currentTotals.watch_time_minutes ?? 0) / 60)
        const currentRevenue = Number(currentTotals.estimated_revenue ?? 0)
        const currentSubscriberDelta = Number(currentTotals.subscribers_gained ?? 0) - Number(currentTotals.subscribers_lost ?? 0)
        const previousViews = Number(previousTotals.views ?? 0)
        const previousWatchHours = Math.round(Number(previousTotals.watch_time_minutes ?? 0) / 60)
        const previousRevenue = Number(previousTotals.estimated_revenue ?? 0)
        setSummary({
          subscribers: lifetimeSubscribers,
          subscriberDelta: currentSubscriberDelta,
          views: currentViews,
          watchHours: currentWatchHours,
          revenue: currentRevenue,
          viewsTrend: trendForDelta(currentViews - previousViews),
          watchTrend: trendForDelta(currentWatchHours - previousWatchHours),
          revenueTrend: trendForDelta(currentRevenue - previousRevenue),
        })
      } catch (error) {
        console.error('Failed to load dashboard channel summary', error)
      }
    }

    loadChannelSummary()
  }, [])

  return (
    <section className="dashboard-channel-card">
      <h2 className="dashboard-channel-title">Channel analytics</h2>
      <div className="dashboard-channel-label">Current subscribers</div>
      <div className="dashboard-channel-subscribers">
        {summary.subscribers !== null ? summary.subscribers.toLocaleString() : '-'}
      </div>
      <div className="dashboard-channel-delta">
        <span className={summary.subscriberDelta >= 0 ? 'dashboard-trend-up' : 'dashboard-trend-down'}>
          {summary.subscriberDelta >= 0 ? '+' : ''}
          {summary.subscriberDelta.toLocaleString()}
        </span>{' '}
        in last 28 days
      </div>
      <div className="dashboard-channel-divider" />
      <div className="dashboard-channel-summary-title">Summary</div>
      <div className="dashboard-channel-summary-sub">Last 28 days</div>
      <div className="dashboard-channel-metric-row">
        <span>Views</span>
        <strong>
          {summary.views.toLocaleString()}
          <span className={`dashboard-metric-arrow dashboard-metric-arrow-${summary.viewsTrend}`} />
        </strong>
      </div>
      <div className="dashboard-channel-metric-row">
        <span>Watch time (hours)</span>
        <strong>
          {summary.watchHours.toLocaleString()}
          <span className={`dashboard-metric-arrow dashboard-metric-arrow-${summary.watchTrend}`} />
        </strong>
      </div>
      <div className="dashboard-channel-metric-row">
        <span>Estimated revenue</span>
        <strong>
          {hideMonetaryValues ? '••••••' : `$${summary.revenue.toFixed(2)}`}
          <span className={`dashboard-metric-arrow dashboard-metric-arrow-${summary.revenueTrend}`} />
        </strong>
      </div>
      <div className="dashboard-channel-divider" />
      <ActionButton label="Go to channel analytics" variant="soft" onClick={() => navigate('/analytics')} />
    </section>
  )
}

export default ChannelAnalyticsCard

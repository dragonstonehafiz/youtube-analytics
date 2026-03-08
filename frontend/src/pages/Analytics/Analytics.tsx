import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataRangeControl, type DateRangeValue } from '../../components/features'
import { fetchChannelYears } from '../../utils/years'
import MetricsTab from './MetricsTab'
import EngagementTab from './EngagementTab'
import MonetizationTab from './MonetizationTab'
import DiscoveryTab from './DiscoveryTab'
import InsightsTab from './InsightsTab'
import { getStored, setStored } from '../../utils/storage'
import type { PublishedItem } from '../../components/charts'
import '../shared.css'
import './Analytics.css'

type AnalyticsTab = 'metrics' | 'engagement' | 'monetization' | 'discovery' | 'insights'

const CONTENT_OPTIONS = [
  { label: 'All Videos', value: 'all' },
  { label: 'Longform', value: 'video' },
  { label: 'Shortform', value: 'short' },
]


function Analytics() {
  const navigate = useNavigate()
  const initialAnalyticsTab = getStored('analyticsTab', 'metrics') as string
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>(
    (['metrics', 'engagement', 'monetization', 'discovery', 'insights'] as string[]).includes(initialAnalyticsTab) ? initialAnalyticsTab as AnalyticsTab : 'metrics'
  )
  const [contentSelection, setContentSelection] = useState(getStored('analyticsContentSelection', 'all'))
  const [rangeValue, setRangeValue] = useState<DateRangeValue | null>(null)
  const [years, setYears] = useState<string[]>([])
  const [publishedDatesDaily, setPublishedDatesDaily] = useState<Record<string, PublishedItem[]>>({})

  useEffect(() => {
    fetchChannelYears().then(setYears).catch(() => {})
  }, [])

  useEffect(() => {
    if (!rangeValue) return
    async function loadPublished() {
      try {
        const contentParam = contentSelection === 'all' ? '' : `&content_type=${contentSelection}`
        const response = await fetch(
          `http://localhost:8000/videos/published?start_date=${rangeValue.range.start}&end_date=${rangeValue.range.end}${contentParam}`
        )
        const data = await response.json()
        const items = Array.isArray(data.items) ? data.items : []
        const map: Record<string, PublishedItem[]> = {}
        items.forEach((item: any) => {
          if (item.day) map[item.day] = Array.isArray(item.items) ? item.items : []
        })
        setPublishedDatesDaily(map)
      } catch (error) {
        console.error('Failed to load published dates', error)
      }
    }
    loadPublished()
  }, [rangeValue?.range.start, rangeValue?.range.end, contentSelection])

  useEffect(() => {
    setStored('analyticsContentSelection', contentSelection)
  }, [contentSelection])

  useEffect(() => {
    setStored('analyticsTab', analyticsTab)
  }, [analyticsTab])

  return (
    <section className="page">
      <header className="page-header header-row">
        <div className="header-text">
          <h1>Analytics</h1>
        </div>
        <div className="analytics-range-controls">
          <DataRangeControl
            storageKey="analyticsRange"
            years={years}
            defaultPreset="range:28d"
            presetPlaceholder="Last 28 days"
            secondaryControl={{
              value: contentSelection,
              onChange: setContentSelection,
              placeholder: 'All videos',
              items: CONTENT_OPTIONS,
            }}
            onChange={setRangeValue}
          />
        </div>
      </header>
      <div className="analytics-tab-row">
        <button
          type="button"
          className={analyticsTab === 'metrics' ? 'analytics-tab active' : 'analytics-tab'}
          onClick={() => setAnalyticsTab('metrics')}
        >
          Metrics
        </button>
        <button
          type="button"
          className={analyticsTab === 'engagement' ? 'analytics-tab active' : 'analytics-tab'}
          onClick={() => setAnalyticsTab('engagement')}
        >
          Engagement
        </button>
        <button
          type="button"
          className={analyticsTab === 'monetization' ? 'analytics-tab active' : 'analytics-tab'}
          onClick={() => setAnalyticsTab('monetization')}
        >
          Monetization
        </button>
        <button
          type="button"
          className={analyticsTab === 'discovery' ? 'analytics-tab active' : 'analytics-tab'}
          onClick={() => setAnalyticsTab('discovery')}
        >
          Discovery
        </button>
        <button
          type="button"
          className={analyticsTab === 'insights' ? 'analytics-tab active' : 'analytics-tab'}
          onClick={() => setAnalyticsTab('insights')}
        >
          Insights
        </button>
      </div>
      <div className="page-body">
        {rangeValue && analyticsTab === 'metrics' && (
          <MetricsTab
            range={rangeValue.range}
            previousRange={rangeValue.previousRange}
            granularity={rangeValue.granularity}
            contentType={contentSelection}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
            publishedDates={publishedDatesDaily}
          />
        )}
        {rangeValue && analyticsTab === 'engagement' && (
          <EngagementTab
            range={rangeValue.range}
            previousRange={rangeValue.previousRange}
            granularity={rangeValue.granularity}
            contentType={contentSelection}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
            publishedDates={publishedDatesDaily}
          />
        )}
        {rangeValue && analyticsTab === 'monetization' && (
          <MonetizationTab
            range={rangeValue.range}
            previousRange={rangeValue.previousRange}
            granularity={rangeValue.granularity}
            contentType={contentSelection}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
            publishedDates={publishedDatesDaily}
          />
        )}
        {rangeValue && analyticsTab === 'discovery' && (
          <DiscoveryTab
            range={rangeValue.range}
            previousRange={rangeValue.previousRange}
            granularity={rangeValue.granularity}
            contentType={contentSelection}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
            publishedDates={publishedDatesDaily}
          />
        )}
        {rangeValue && analyticsTab === 'insights' && (
          <InsightsTab
            range={rangeValue.range}
            previousRange={rangeValue.previousRange}
            granularity={rangeValue.granularity}
            contentType={contentSelection}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
          />
        )}
      </div>
    </section>
  )
}

export default Analytics

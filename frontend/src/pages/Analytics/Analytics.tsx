import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataRangeControl } from '../../components/features'
import MetricsTab from './MetricsTab'
import MonetizationTab from './MonetizationTab'
import DiscoveryTab from './DiscoveryTab'
import InsightsTab from './InsightsTab'
import { getStored, setStored } from '../../utils/storage'
import { useAnalyticsDateRange, GRANULARITY_OPTIONS } from '../../hooks/useAnalyticsDateRange'
import '../shared.css'
import './Analytics.css'

type Granularity = 'daily' | '7d' | '28d' | '90d' | 'monthly' | 'yearly'
type AnalyticsTab = 'metrics' | 'monetization' | 'discovery' | 'insights'

const CONTENT_OPTIONS = [
  { label: 'All Videos', value: 'all' },
  { label: 'Longform', value: 'video' },
  { label: 'Shortform', value: 'short' },
]


function Analytics() {
  const navigate = useNavigate()
  const {
    years,
    mode, setMode,
    presetSelection, setPresetSelection,
    yearSelection, setYearSelection,
    monthSelection, setMonthSelection,
    customStart, setCustomStart,
    customEnd, setCustomEnd,
    range,
    previousRange,
    rangeOptions,
  } = useAnalyticsDateRange({ storageKey: 'analyticsRange', defaultPreset: 'range:28d' })
  const initialAnalyticsTab = getStored('analyticsTab', 'metrics') as string
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>(
    (['metrics', 'monetization', 'discovery', 'insights'] as string[]).includes(initialAnalyticsTab) ? initialAnalyticsTab as AnalyticsTab : 'metrics'
  )
  const [contentSelection, setContentSelection] = useState(getStored('analyticsContentSelection', 'all'))
  const [granularity, setGranularity] = useState<Granularity>(getStored('analyticsGranularity', 'daily'))

  useEffect(() => {
    setStored('analyticsContentSelection', contentSelection)
  }, [contentSelection])

  useEffect(() => {
    setStored('analyticsGranularity', granularity)
  }, [granularity])

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
            granularity={granularity}
            onGranularityChange={(value) => setGranularity(value as Granularity)}
            mode={mode}
            onModeChange={setMode}
            presetSelection={presetSelection}
            onPresetSelectionChange={setPresetSelection}
            yearSelection={yearSelection}
            onYearSelectionChange={setYearSelection}
            monthSelection={monthSelection}
            onMonthSelectionChange={setMonthSelection}
            customStart={customStart}
            customEnd={customEnd}
            onCustomRangeChange={(nextStart, nextEnd) => {
              setCustomStart(nextStart)
              setCustomEnd(nextEnd)
            }}
            years={years}
            rangeOptions={rangeOptions}
            granularityOptions={GRANULARITY_OPTIONS}
            secondaryControl={{
              value: contentSelection,
              onChange: setContentSelection,
              placeholder: 'All videos',
              items: CONTENT_OPTIONS,
            }}
            presetPlaceholder="Last 28 days"
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
        {analyticsTab === 'metrics' && (
          <MetricsTab
            range={range}
            previousRange={previousRange}
            granularity={granularity}
            contentType={contentSelection}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
          />
        )}
        {analyticsTab === 'monetization' && (
          <MonetizationTab
            range={range}
            previousRange={previousRange}
            granularity={granularity}
            contentType={contentSelection}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
          />
        )}
        {analyticsTab === 'discovery' && (
          <DiscoveryTab
            range={range}
            previousRange={previousRange}
            granularity={granularity}
            contentType={contentSelection}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
          />
        )}
        {analyticsTab === 'insights' && (
          <InsightsTab
            range={range}
            previousRange={previousRange}
            granularity={granularity}
            contentType={contentSelection}
            onOpenVideo={(videoId) => navigate(`/videos/${videoId}`)}
          />
        )}
      </div>
    </section>
  )
}

export default Analytics

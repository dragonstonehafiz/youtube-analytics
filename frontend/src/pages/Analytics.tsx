import { useEffect, useMemo, useState } from 'react'
import { DateRangePicker, Dropdown } from '../components/ui'
import { MetricChartCard, TopContentTable } from '../components/analytics'
import { PageCard } from '../components/layout'
import { getStored, setStored } from '../utils/storage'
import './Page.css'

function Analytics() {
  const [years, setYears] = useState<string[]>([])
  const rangeOptions = [
    { label: 'Last 7 days', value: 'range:7d' },
    { label: 'Last 28 days', value: 'range:28d' },
    { label: 'Last 365 days', value: 'range:365d' },
    { label: 'Full data', value: 'full' },
  ]
  const storedRange = getStored('analyticsRange', null as {
    mode?: 'presets' | 'year' | 'custom'
    presetSelection?: string
    yearSelection?: string
    monthSelection?: string
    customStart?: string
    customEnd?: string
  } | null)
  const [mode, setMode] = useState<'presets' | 'year' | 'custom'>(storedRange?.mode ?? 'presets')
  const [presetSelection, setPresetSelection] = useState(storedRange?.presetSelection ?? 'range:28d')
  const [yearSelection, setYearSelection] = useState(storedRange?.yearSelection ?? '')
  const [monthSelection, setMonthSelection] = useState(storedRange?.monthSelection ?? 'all')
  const today = new Date().toISOString().slice(0, 10)
  const [customStart, setCustomStart] = useState(storedRange?.customStart ?? today)
  const [customEnd, setCustomEnd] = useState(storedRange?.customEnd ?? today)
  const [series, setSeries] = useState<Record<string, { date: string; value: number }[]>>({})
  const [publishedDates, setPublishedDates] = useState<Record<string, { title: string; published_at: string; thumbnail_url: string }[]>>({})
  const [totals, setTotals] = useState({
    views: 0,
    watch_time_minutes: 0,
    subscribers_net: 0,
    estimated_revenue: 0,
  })
  const [topContent, setTopContent] = useState<
    {
      rank: number
      title: string
      published_at: string
      thumbnail_url: string
      avg_view_duration: string
      avg_view_pct: string
      views: string
    }[]
  >([])

  const range = useMemo(() => {
    const now = new Date()
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    const format = (value: Date) => value.toISOString().slice(0, 10)
    if (mode === 'presets') {
      if (presetSelection.startsWith('range:')) {
        const days = parseInt(presetSelection.split(':')[1].replace('d', ''), 10)
        const start = new Date(today)
        start.setUTCDate(start.getUTCDate() - (days - 1))
        return { start: format(start), end: format(today) }
      }
      if (presetSelection === 'full') {
        if (years.length > 0) {
          const parsed = years.map((value) => parseInt(value, 10)).filter((value) => !Number.isNaN(value))
          const minYear = Math.min(...parsed)
          const maxYear = Math.max(...parsed)
          return { start: `${minYear}-01-01`, end: `${maxYear}-12-31` }
        }
        return { start: format(today), end: format(today) }
      }
    }
    if (mode === 'year' && yearSelection) {
      const year = parseInt(yearSelection, 10)
      if (!Number.isNaN(year)) {
        if (monthSelection === 'all') {
          return { start: `${year}-01-01`, end: `${year}-12-31` }
        }
        const month = parseInt(monthSelection, 10)
        if (!Number.isNaN(month)) {
          const start = new Date(Date.UTC(year, month - 1, 1))
          const end = new Date(Date.UTC(year, month, 0))
          return { start: format(start), end: format(end) }
        }
        return { start: `${year}-01-01`, end: `${year}-12-31` }
      }
    }
    if (mode === 'custom') {
      return { start: customStart, end: customEnd }
    }
    return { start: format(today), end: format(today) }
  }, [mode, presetSelection, yearSelection, monthSelection, customStart, customEnd, years])

  useEffect(() => {
    async function loadYears() {
      try {
        const response = await fetch('http://127.0.0.1:8000/analytics/years')
        const data = await response.json()
        if (Array.isArray(data.years) && data.years.length > 0) {
          setYears(data.years)
          setYearSelection((prev) => (prev ? prev : data.years[0]))
        }
      } catch (error) {
        console.error('Failed to load years', error)
      }
    }

    loadYears()
  }, [])

  useEffect(() => {
    if (mode === 'year' && !yearSelection && years.length > 0) {
      setYearSelection(years[0])
    }
  }, [mode, yearSelection, years])

  useEffect(() => {
    setStored('analyticsRange', {
      mode,
      presetSelection,
      yearSelection,
      monthSelection,
      customStart,
      customEnd,
    })
  }, [mode, presetSelection, yearSelection, monthSelection, customStart, customEnd])

  useEffect(() => {
    async function loadSummary() {
      try {
        const response = await fetch(
          `http://127.0.0.1:8000/analytics/channel-daily?start_date=${range.start}&end_date=${range.end}`
        )
        const data = await response.json()
        const items = Array.isArray(data.items) ? data.items : []
        const gained = data.totals?.subscribers_gained ?? 0
        const lost = data.totals?.subscribers_lost ?? 0
        setTotals({
          views: data.totals?.views ?? 0,
          watch_time_minutes: data.totals?.watch_time_minutes ?? 0,
          subscribers_net: gained - lost,
          estimated_revenue: data.totals?.estimated_revenue ?? 0,
        })
        const byDay = new Map<string, any>()
        items.forEach((item: any) => {
          byDay.set(item.day, item)
        })
        const days: string[] = []
        const cursor = new Date(`${range.start}T00:00:00Z`)
        const end = new Date(`${range.end}T00:00:00Z`)
        while (cursor <= end) {
          days.push(cursor.toISOString().slice(0, 10))
          cursor.setUTCDate(cursor.getUTCDate() + 1)
        }
        setSeries({
          views: days.map((day) => ({ date: day, value: byDay.get(day)?.views ?? 0 })),
          watch_time: days.map((day) => ({
            date: day,
            value: Math.round((byDay.get(day)?.watch_time_minutes ?? 0) / 60),
          })),
          subscribers: days.map((day) => ({
            date: day,
            value: (byDay.get(day)?.subscribers_gained ?? 0) - (byDay.get(day)?.subscribers_lost ?? 0),
          })),
          revenue: days.map((day) => ({ date: day, value: byDay.get(day)?.estimated_revenue ?? 0 })),
        })
      } catch (error) {
        console.error('Failed to load analytics summary', error)
      }
    }

    loadSummary()
  }, [range.start, range.end])

  useEffect(() => {
    async function loadPublished() {
      try {
        const response = await fetch(`http://127.0.0.1:8000/videos/published?start_date=${range.start}&end_date=${range.end}`)
        const data = await response.json()
        const items = Array.isArray(data.items) ? data.items : []
        const map: Record<string, { title: string; published_at: string; thumbnail_url: string }[]> = {}
        items.forEach((item: any) => {
          if (item.day) {
            map[item.day] = Array.isArray(item.items) ? item.items : []
          }
        })
        setPublishedDates(map)
      } catch (error) {
        console.error('Failed to load published dates', error)
      }
    }

    loadPublished()
  }, [range.start, range.end])

  useEffect(() => {
    async function loadTopContent() {
      try {
        const response = await fetch(
          `http://127.0.0.1:8000/analytics/top-content?start_date=${range.start}&end_date=${range.end}&limit=10`
        )
        const data = await response.json()
        const items = Array.isArray(data.items) ? data.items : []
        const formatDuration = (seconds: number) => {
          const mins = Math.floor(seconds / 60)
          const secs = Math.floor(seconds % 60)
          return `${mins}:${secs.toString().padStart(2, '0')}`
        }
        const formatted = items.map((item: any, index: number) => ({
          rank: index + 1,
          title: item.title,
          published_at: item.published_at ? new Date(item.published_at).toLocaleDateString() : '',
          thumbnail_url: item.thumbnail_url ?? '',
          avg_view_duration: formatDuration(item.avg_view_duration_seconds ?? 0),
          avg_view_pct: `${(item.avg_view_pct ?? 0).toFixed(1)}%`,
          views: Number(item.views ?? 0).toLocaleString(),
        }))
        setTopContent(formatted)
      } catch (error) {
        console.error('Failed to load top content', error)
      }
    }

    loadTopContent()
  }, [range.start, range.end])

  return (
    <section className="page">
      <header className="page-header header-row">
        <div className="header-text">
          <h1>Analytics</h1>
        </div>
        <div className="analytics-range-controls">
          <Dropdown
            value={mode}
            onChange={(value) => setMode(value as 'presets' | 'year' | 'custom')}
            placeholder="Presets"
            items={[
              { type: 'option' as const, label: 'Presets', value: 'presets' },
              { type: 'option' as const, label: 'Yearly', value: 'year' },
              { type: 'option' as const, label: 'Custom range', value: 'custom' },
            ]}
          />
          {mode === 'presets' ? (
            <Dropdown
              value={presetSelection}
              onChange={setPresetSelection}
              placeholder="Last 28 days"
              items={rangeOptions.map((option) => ({ type: 'option' as const, ...option }))}
            />
          ) : null}
          {mode === 'year' ? (
            <>
              <Dropdown
                value={yearSelection}
                onChange={setYearSelection}
                placeholder="Select year"
                items={years.map((item) => ({ type: 'option' as const, label: item, value: item }))}
              />
              <Dropdown
                value={monthSelection}
                onChange={setMonthSelection}
                placeholder="All months"
                items={[
                  { type: 'option' as const, label: 'All months', value: 'all' },
                  { type: 'option' as const, label: 'January', value: '1' },
                  { type: 'option' as const, label: 'February', value: '2' },
                  { type: 'option' as const, label: 'March', value: '3' },
                  { type: 'option' as const, label: 'April', value: '4' },
                  { type: 'option' as const, label: 'May', value: '5' },
                  { type: 'option' as const, label: 'June', value: '6' },
                  { type: 'option' as const, label: 'July', value: '7' },
                  { type: 'option' as const, label: 'August', value: '8' },
                  { type: 'option' as const, label: 'September', value: '9' },
                  { type: 'option' as const, label: 'October', value: '10' },
                  { type: 'option' as const, label: 'November', value: '11' },
                  { type: 'option' as const, label: 'December', value: '12' },
                ]}
              />
            </>
          ) : null}
          {mode === 'custom' ? (
            <DateRangePicker
              startDate={customStart}
              endDate={customEnd}
              onChange={(nextStart, nextEnd) => {
                setCustomStart(nextStart)
                setCustomEnd(nextEnd)
              }}
            />
          ) : null}
        </div>
      </header>
      <div className="page-body">
        <div className="page-row">
          <PageCard>
            <MetricChartCard
              metrics={[
                { key: 'views', label: 'Views', value: totals.views.toLocaleString() },
                { key: 'watch_time', label: 'Watch time (hours)', value: Math.round(totals.watch_time_minutes / 60).toLocaleString() },
                { key: 'subscribers', label: 'Subscribers', value: totals.subscribers_net.toLocaleString() },
                { key: 'revenue', label: 'Estimated revenue', value: `$${Math.round(totals.estimated_revenue).toLocaleString()}` },
              ]}
              series={{
                views: series.views ?? [],
                watch_time: series.watch_time ?? [],
                subscribers: series.subscribers ?? [],
                revenue: series.revenue ?? [],
              }}
              publishedDates={publishedDates}
            />
          </PageCard>
        </div>
        <div className="page-row">
          <PageCard>
            <TopContentTable
              items={topContent}
            />
          </PageCard>
        </div>
      </div>
    </section>
  )
}

export default Analytics

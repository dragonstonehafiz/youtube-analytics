import { useEffect, useMemo, useState } from 'react'
import { ContentInsightsCard, DonutChartCard, HistogramChartCard, PageCard, type ContentInsights } from '../../components/cards'
import { formatWholeNumber } from '../../utils/number'

type PlaylistItemForHistogram = { video_view_count?: number | null }

type Props = {
  playlistId: string | undefined
  range: { start: string; end: string }
  onOpenVideo: (videoId: string) => void
}

export default function InsightsTab({ playlistId, range, onOpenVideo }: Props) {
  const [contentInsights, setContentInsights] = useState<ContentInsights | null>(null)
  const [histogramItems, setHistogramItems] = useState<PlaylistItemForHistogram[]>([])

  useEffect(() => {
    async function loadHistogramItems() {
      if (!playlistId) { setHistogramItems([]); return }
      try {
        const params = new URLSearchParams({ limit: '500', offset: '0', sort_by: 'position', direction: 'asc' })
        const res = await fetch(`http://localhost:8000/playlists/${playlistId}/items?${params.toString()}`)
        if (!res.ok) return
        const data = await res.json()
        setHistogramItems(Array.isArray(data.items) ? data.items : [])
      } catch {
        setHistogramItems([])
      }
    }
    loadHistogramItems()
  }, [playlistId])

  useEffect(() => {
    async function loadContentInsights() {
      if (!playlistId) { setContentInsights(null); return }
      try {
        const response = await fetch(
          `http://localhost:8000/analytics/content-insights?start_date=${range.start}&end_date=${range.end}&playlist_id=${playlistId}`
        )
        const data = await response.json()
        setContentInsights(data)
      } catch {
        setContentInsights(null)
      }
    }
    loadContentInsights()
  }, [playlistId, range.start, range.end])

  const histogramViewData = useMemo(() => {
    const views = histogramItems.map((item) => item.video_view_count ?? 0)
    return views.length > 0 ? views : [0]
  }, [histogramItems])

  return (
    <div className="page-row">
      <div className="playlist-insights-layout">
        <div className="playlist-insights-left">
          <PageCard>
            <ContentInsightsCard data={contentInsights} onOpenVideo={onOpenVideo} />
          </PageCard>
          <PageCard>
            <HistogramChartCard
              title="Distribution of Video Views"
              viewData={histogramViewData}
              color="#0ea5e9"
              binCount={15}
            />
          </PageCard>
        </div>
        <div className="playlist-insights-right">
          <PageCard>
            <DonutChartCard
              title="New Uploads vs Old Upload Views"
              titleTooltip="New uploads are videos uploaded in the current period. Old uploads are everything before that."
              segments={[
                { key: 'new', label: 'New uploads', value: contentInsights?.in_period_views ?? 0, color: '#0ea5e9', displayValue: `${contentInsights?.in_period_pct ?? 0}%` },
                { key: 'catalog', label: 'Old uploads', value: contentInsights?.catalog_views ?? 0, color: '#22c55e', displayValue: `${contentInsights?.catalog_pct ?? 0}%` },
              ]}
              centerLabel="Total views"
              centerValue={formatWholeNumber((contentInsights?.in_period_views ?? 0) + (contentInsights?.catalog_views ?? 0))}
              ariaLabel="New uploads vs old uploads views"
            />
          </PageCard>
          <PageCard>
            <DonutChartCard
              title="Shortform vs Longform Views"
              segments={[
                { key: 'short', label: 'Short-form', value: contentInsights?.shortform_views ?? 0, color: '#f97316', displayValue: `${contentInsights?.shortform_pct ?? 0}%` },
                { key: 'long', label: 'Long-form', value: contentInsights?.longform_views ?? 0, color: '#a855f7', displayValue: `${contentInsights?.longform_pct ?? 0}%` },
              ]}
              centerLabel="Total views"
              centerValue={formatWholeNumber((contentInsights?.shortform_views ?? 0) + (contentInsights?.longform_views ?? 0))}
              ariaLabel="Short-form vs long-form views"
            />
          </PageCard>
        </div>
      </div>
    </div>
  )
}

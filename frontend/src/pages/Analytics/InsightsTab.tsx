import { useState, useEffect, useMemo } from 'react'
import { ContentInsightsCard, DonutChartCard, HistogramChartCard, PageCard, type ContentInsights } from '../../components/cards'
import { formatWholeNumber } from '../../utils/number'

type Props = {
  range: { start: string; end: string }
  previousRange: { start: string; end: string; daySpan: number }
  granularity: 'daily' | '7d' | '28d' | '90d' | 'monthly' | 'yearly'
  contentType: string
  onOpenVideo: (videoId: string) => void
}

export default function InsightsTab({ range, contentType, onOpenVideo }: Props) {
  const [contentInsights, setContentInsights] = useState<ContentInsights | null>(null)

  useEffect(() => {
    async function loadContentInsights() {
      try {
        const contentParam = contentType === 'all' ? '' : `&content_type=${contentType}`
        const response = await fetch(
          `http://localhost:8000/analytics/content-insights?start_date=${range.start}&end_date=${range.end}${contentParam}`
        )
        const data = await response.json()
        setContentInsights(data)
      } catch (error) {
        console.error('Failed to load content insights', error)
        setContentInsights(null)
      }
    }
    loadContentInsights()
  }, [range.start, range.end, contentType])

  const histogramViewData = useMemo(() => {
    const views = contentInsights?.all_video_views ?? []
    return views.length > 0 ? views : [0]
  }, [contentInsights?.all_video_views])

  return (
    <div className="analytics-monetization-layout">
      <PageCard>
        <ContentInsightsCard data={contentInsights} onOpenVideo={onOpenVideo} />
      </PageCard>
      <div className="analytics-monetization-cards-row">
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
      <PageCard>
        <HistogramChartCard
          title="Distribution of Video Views"
          viewData={histogramViewData}
          color="#0ea5e9"
          binCount={20}
        />
      </PageCard>
    </div>
  )
}

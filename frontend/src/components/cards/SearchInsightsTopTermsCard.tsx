import { useEffect, useMemo, useRef, useState } from 'react'
import { UploadPublishTooltip, type UploadHoverState } from '../charts'
import { formatWholeNumber } from '../../utils/number'
import './SearchInsightsTopTermsCard.css'

type SearchInsightsTopTerm = {
  search_term: string
  views: number
  watch_time_minutes: number
  video_count: number
}

type SearchInsightsTopTermsCardProps = {
  items: SearchInsightsTopTerm[]
  loading: boolean
  error: string | null
  startDate: string
  endDate: string
  contentType?: string | null
  videoIds?: string[]
}

type SearchInsightsTermVideo = {
  video_id: string
  title: string
  thumbnail_url: string
  views: number
}

type TooltipItem = {
  video_id?: string
  title: string
  thumbnail_url: string
  content_type: string
  published_at: string
  detail: string
}

function SearchInsightsTopTermsCard({
  items,
  loading,
  error,
  startDate,
  endDate,
  contentType = null,
  videoIds = [],
}: SearchInsightsTopTermsCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const hoverTimeoutRef = useRef<number | null>(null)
  const [cardWidth, setCardWidth] = useState(0)
  const [hoverTerm, setHoverTerm] = useState<string | null>(null)
  const [hoverTooltip, setHoverTooltip] = useState<UploadHoverState | null>(null)
  const [termVideos, setTermVideos] = useState<Record<string, SearchInsightsTermVideo[]>>({})
  const [termVideosLoading, setTermVideosLoading] = useState<Record<string, boolean>>({})
  const [termVideosError, setTermVideosError] = useState<Record<string, string>>({})
  const isCompact = cardWidth > 0 && cardWidth <= 460
  const topItems = useMemo(() => items.slice(0, 10), [items])
  const topItemsWithDisplay = useMemo(
    () =>
      topItems.map((item) => ({
        ...item,
        viewsText: formatWholeNumber(item.views),
        videosText: formatWholeNumber(item.video_count),
    })),
    [topItems]
  )
  const numericColumnWidths = useMemo(() => {
    const viewsChars = Math.max('Views'.length, ...topItemsWithDisplay.map((item) => item.viewsText.length))
    const videosChars = Math.max('Videos'.length, ...topItemsWithDisplay.map((item) => item.videosText.length))
    return {
      viewsWidth: `${viewsChars + 1}ch`,
      videosWidth: `${videosChars + 1}ch`,
    }
  }, [topItemsWithDisplay])

  useEffect(() => {
    if (!cardRef.current) {
      return
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCardWidth(Math.floor(entry.contentRect.width))
      }
    })
    observer.observe(cardRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        window.clearTimeout(hoverTimeoutRef.current)
        hoverTimeoutRef.current = null
      }
    }
  }, [])

  const loadTermVideos = async (searchTerm: string) => {
    if (termVideosLoading[searchTerm]) {
      return
    }
    if (termVideos[searchTerm] && !termVideosError[searchTerm]) {
      return
    }
    setTermVideosLoading((prev) => ({ ...prev, [searchTerm]: true }))
    setTermVideosError((prev) => {
      const next = { ...prev }
      delete next[searchTerm]
      return next
    })
    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        search_term: searchTerm,
      })
      if (contentType) {
        params.set('content_type', contentType)
      }
      if (videoIds.length > 0) {
        params.set('video_ids', videoIds.join(','))
      }
      const response = await fetch(`http://127.0.0.1:8000/analytics/video-search-insights/videos?${params.toString()}`)
      if (!response.ok) {
        throw new Error(`Failed to load videos (${response.status})`)
      }
      const payload = await response.json()
      const mapped = (Array.isArray(payload?.items) ? payload.items : []).map((item: any) => ({
        video_id: String(item?.video_id ?? ''),
        title: String(item?.title ?? '(untitled)'),
        thumbnail_url: String(item?.thumbnail_url ?? ''),
        views: Number(item?.views ?? 0),
      }))
      setTermVideos((prev) => ({ ...prev, [searchTerm]: mapped }))
    } catch (loadError) {
      setTermVideosError((prev) => ({
        ...prev,
        [searchTerm]: loadError instanceof Error ? loadError.message : 'Failed to load videos.',
      }))
      setTermVideos((prev) => {
        const next = { ...prev }
        delete next[searchTerm]
        return next
      })
    } finally {
      setTermVideosLoading((prev) => ({ ...prev, [searchTerm]: false }))
    }
  }

  const buildTooltipItems = (searchTerm: string): TooltipItem[] => {
    const videos = termVideos[searchTerm] ?? []
    const loadingTerm = termVideosLoading[searchTerm] === true
    const errorTerm = termVideosError[searchTerm]
    if (loadingTerm) {
      return [{ title: 'Loading videos...', thumbnail_url: '', content_type: '', published_at: '', detail: '' }]
    }
    if (errorTerm) {
      return [{ title: errorTerm, thumbnail_url: '', content_type: '', published_at: '', detail: '' }]
    }
    if (videos.length === 0) {
      return [{ title: 'No videos found for this term.', thumbnail_url: '', content_type: '', published_at: '', detail: '' }]
    }
    return videos.map((video) => ({
      video_id: video.video_id,
      title: video.title,
      thumbnail_url: video.thumbnail_url,
      content_type: '',
      published_at: '',
      detail: `${formatWholeNumber(video.views)} views from search`,
    }))
  }

  useEffect(() => {
    if (!hoverTerm) {
      return
    }
    setHoverTooltip((prev) => {
      if (!prev || prev.key !== hoverTerm) {
        return prev
      }
      return { ...prev, items: buildTooltipItems(hoverTerm) }
    })
  }, [hoverTerm, termVideos, termVideosLoading, termVideosError])

  const openTooltip = (searchTerm: string, target: HTMLElement) => {
    if (!listRef.current) {
      return
    }
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setHoverTerm(searchTerm)
    const listRect = listRef.current.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const tooltipWidth = 260
    const tooltipHeight = 170
    const halfWidth = tooltipWidth / 2
    const minCenter = Math.min(halfWidth, Math.max(0, listRect.width / 2))
    const maxCenter = Math.max(minCenter, listRect.width - halfWidth)
    const rightGap = 12
    const preferredCenter = targetRect.right - listRect.left + rightGap + halfWidth
    const clampedCenter = Math.max(minCenter, Math.min(maxCenter, preferredCenter))
    const preferredTopInViewport = targetRect.bottom + 4
    const maxTopInViewport = window.innerHeight - tooltipHeight - 8
    const adjustedTopInViewport = Math.min(preferredTopInViewport, maxTopInViewport)
    const clampedTopInViewport = Math.max(8, adjustedTopInViewport)
    const tooltipItems = buildTooltipItems(searchTerm)
    setHoverTooltip({
      x: clampedCenter,
      y: clampedTopInViewport - listRect.top,
      items: tooltipItems,
      key: searchTerm,
      startDate: startDate,
      endDate: endDate,
      dayCount: 0,
    })
    if (!termVideosLoading[searchTerm] && !termVideos[searchTerm]) {
      loadTermVideos(searchTerm)
    }
  }

  const closeTooltipSoon = () => {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current)
    }
    hoverTimeoutRef.current = window.setTimeout(() => {
      setHoverTerm(null)
      setHoverTooltip(null)
      hoverTimeoutRef.current = null
    }, 140)
  }

  return (
    <div className={isCompact ? 'search-insights-card compact' : 'search-insights-card'} ref={cardRef}>
      <div className={isCompact ? 'search-insights-title compact' : 'search-insights-title'}>Top YouTube search terms</div>
      {loading ? <div className="search-insights-state">Loading search terms...</div> : null}
      {error ? <div className="search-insights-state">{error}</div> : null}
      {!loading && !error ? (
        topItemsWithDisplay.length === 0 ? (
          <div className="search-insights-state">No monthly search-insight rows in the selected range.</div>
        ) : (
          <div className="search-insights-list" ref={listRef}>
            <table
              className="search-insights-table"
              style={
                {
                  '--search-insights-views-col': numericColumnWidths.viewsWidth,
                  '--search-insights-videos-col': numericColumnWidths.videosWidth,
                } as Record<string, string>
              }
            >
              <colgroup>
                <col className="search-insights-col-term" />
                <col className="search-insights-col-views" />
                <col className="search-insights-col-videos" />
              </colgroup>
              <thead>
                <tr className="search-insights-header">
                  <th className="search-insights-header-term">Search term</th>
                  <th className="search-insights-header-metric">Views</th>
                  <th className="search-insights-header-metric">Videos</th>
                </tr>
              </thead>
              <tbody>
                {topItemsWithDisplay.map((item, index) => (
                  <tr key={`${item.search_term}-${index}`} className="search-insights-row">
                    <td className="search-insights-term-cell">
                      <span className="search-insights-term" title={item.search_term || '(empty term)'}>
                        {item.search_term || '(empty term)'}
                      </span>
                    </td>
                    <td className="search-insights-metric">{item.viewsText}</td>
                    <td className="search-insights-videos-cell">
                      <button
                        type="button"
                        className="search-insights-videos-trigger"
                        onMouseEnter={(event) => openTooltip(item.search_term, event.currentTarget)}
                        onMouseLeave={closeTooltipSoon}
                        onFocus={(event) => openTooltip(item.search_term, event.currentTarget)}
                        onBlur={closeTooltipSoon}
                      >
                        {item.videosText}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <UploadPublishTooltip
              hover={hoverTerm ? hoverTooltip : null}
              onMouseEnter={() => {
                if (hoverTimeoutRef.current) {
                  window.clearTimeout(hoverTimeoutRef.current)
                  hoverTimeoutRef.current = null
                }
              }}
              onMouseLeave={closeTooltipSoon}
              titleOverride={hoverTerm ? `Videos from search: ${hoverTerm}` : undefined}
              statsOverride={
                hoverTerm
                  ? [
                      termVideosLoading[hoverTerm]
                        ? 'Loading videos...'
                        : `${formatWholeNumber((termVideos[hoverTerm] ?? []).length)} videos found`,
                    ]
                  : undefined
              }
            />
          </div>
        )
      ) : null}
    </div>
  )
}

export type { SearchInsightsTopTerm }
export default SearchInsightsTopTermsCard

import { useEffect, useMemo, useState } from 'react'
import { PageSizePicker, PageSwitcher } from '../../components/ui'
import { CommentsWordCloudCard, LlmSummaryCard, PageCard } from '../../components/cards'
import { CommentFilter, type CommentSort } from '../../components/features'
import { CommentsSection, type CommentApiRow } from '../../components/tables'
import { buildCommentGroups } from '../../components/features'
import usePagination from '../../hooks/usePagination'
import { useLlmSummary } from '../../hooks/useLlmSummary'
import { useWordCloud, WORD_TYPE_OPTIONS } from '../../hooks/useWordCloud'
import { getStored, setStored } from '../../utils/storage'

type StoredCommentsSettings = {
  pageSize?: number
  sortBy?: CommentSort
  searchText?: string
  postedAfter?: string
  postedBefore?: string
  page?: number
}

type Props = {
  playlistId: string | undefined
}

export default function CommentsTab({ playlistId }: Props) {
  const commentsSettingsKey = `playlistDetailCommentsSettings:${playlistId ?? 'unknown'}`
  const storedSettings = getStored(commentsSettingsKey, null as StoredCommentsSettings | null)

  const [commentsRows, setCommentsRows] = useState<CommentApiRow[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsError, setCommentsError] = useState<string | null>(null)
  const [commentsTotal, setCommentsTotal] = useState(0)
  const [commentsSortBy, setCommentsSortBy] = useState<CommentSort>(storedSettings?.sortBy ?? 'published_at')
  const [commentsSearchText, setCommentsSearchText] = useState(storedSettings?.searchText ?? '')
  const [commentsPostedAfter, setCommentsPostedAfter] = useState(storedSettings?.postedAfter ?? '')
  const [commentsPostedBefore, setCommentsPostedBefore] = useState(storedSettings?.postedBefore ?? '')

  const {
    page: commentsPage,
    setPage: setCommentsPage,
    pageSize: commentsPageSize,
    setPageSize: setCommentsPageSize,
    totalPages: commentsTotalPages,
  } = usePagination({
    total: commentsTotal,
    defaultPage: storedSettings?.page ?? 1,
    defaultPageSize: storedSettings?.pageSize ?? 10,
  })

  const {
    wordTypes, setWordTypes,
    wordCloudImageUrl,
    wordCloudLoading,
    wordCloudError,
    generateWordCloud,
  } = useWordCloud()

  const {
    summaryLimitInput, setSummaryLimitInput,
    summarySortBy, setSummarySortBy,
    summaryLoading,
    summaryError,
    summaryText,
    resetSummary,
    summarize,
  } = useLlmSummary({ searchText: commentsSearchText, postedAfter: commentsPostedAfter, postedBefore: commentsPostedBefore })

  const commentsGroups = useMemo(() => buildCommentGroups(commentsRows), [commentsRows])

  // Restore stored settings when playlistId changes
  useEffect(() => {
    const stored = getStored(commentsSettingsKey, null as StoredCommentsSettings | null)
    setCommentsPage(stored?.page ?? 1)
    if (typeof stored?.pageSize === 'number') setCommentsPageSize(stored.pageSize)
    setCommentsSortBy(stored?.sortBy ?? 'published_at')
    setCommentsSearchText(stored?.searchText ?? '')
    setCommentsPostedAfter(stored?.postedAfter ?? '')
    setCommentsPostedBefore(stored?.postedBefore ?? '')
  }, [commentsSettingsKey, setCommentsPage, setCommentsPageSize])

  // Reset page when filters change
  useEffect(() => {
    setCommentsPage(1)
  }, [playlistId, commentsSortBy, commentsSearchText, commentsPostedAfter, commentsPostedBefore, setCommentsPage])

  // Reset summary when playlist changes
  useEffect(() => {
    resetSummary()
  }, [playlistId, resetSummary])

  // Persist settings
  useEffect(() => {
    setStored(commentsSettingsKey, {
      pageSize: commentsPageSize,
      sortBy: commentsSortBy,
      searchText: commentsSearchText,
      postedAfter: commentsPostedAfter,
      postedBefore: commentsPostedBefore,
      page: commentsPage,
    } satisfies StoredCommentsSettings)
  }, [commentsSettingsKey, commentsPageSize, commentsSortBy, commentsSearchText, commentsPostedAfter, commentsPostedBefore, commentsPage])

  // Load comments
  useEffect(() => {
    async function loadComments() {
      if (!playlistId) {
        setCommentsRows([])
        setCommentsTotal(0)
        setCommentsError('Missing playlist ID.')
        return
      }
      setCommentsLoading(true)
      setCommentsError(null)
      try {
        const offset = (commentsPage - 1) * commentsPageSize
        const params = new URLSearchParams({
          playlist_id: playlistId,
          limit: String(commentsPageSize),
          offset: String(offset),
          sort_by: commentsSortBy,
          direction: 'desc',
        })
        if (commentsSearchText.trim()) params.set('q', commentsSearchText.trim())
        if (commentsPostedAfter) params.set('published_after', commentsPostedAfter)
        if (commentsPostedBefore) params.set('published_before', commentsPostedBefore)
        const response = await fetch(`http://localhost:8000/comments?${params.toString()}`)
        if (!response.ok) throw new Error(`Failed to load playlist comments (${response.status})`)
        const data = await response.json()
        setCommentsRows(Array.isArray(data.items) ? (data.items as CommentApiRow[]) : [])
        setCommentsTotal(typeof data.total === 'number' ? data.total : 0)
      } catch (err) {
        setCommentsError(err instanceof Error ? err.message : 'Failed to load comments.')
      } finally {
        setCommentsLoading(false)
      }
    }
    loadComments()
  }, [playlistId, commentsPage, commentsPageSize, commentsSortBy, commentsSearchText, commentsPostedAfter, commentsPostedBefore])

  const handleGenerateWordCloud = () => {
    if (!playlistId) return
    const params = new URLSearchParams()
    params.set('playlist_id', playlistId)
    params.set('max_words', '120')
    params.set('min_count', '2')
    if (commentsPostedAfter) params.set('published_after', commentsPostedAfter)
    if (commentsPostedBefore) params.set('published_before', commentsPostedBefore)
    if (commentsSearchText.trim()) params.set('q', commentsSearchText.trim())
    generateWordCloud(params)
  }

  const handleSummarize = () => {
    if (!playlistId) return
    summarize({ playlist_id: playlistId })
  }

  const handleReset = () => {
    setCommentsSearchText('')
    setCommentsPostedAfter('')
    setCommentsPostedBefore('')
    setCommentsSortBy('published_at')
  }

  return (
    <>
      <div className="page-row">
        <PageCard>
          <CommentFilter
            showTitle
            searchText={commentsSearchText}
            onSearchTextChange={setCommentsSearchText}
            postedAfter={commentsPostedAfter}
            postedBefore={commentsPostedBefore}
            onDateRangeChange={(start, end) => { setCommentsPostedAfter(start); setCommentsPostedBefore(end) }}
            sortBy={commentsSortBy}
            onSortByChange={setCommentsSortBy}
            onReset={handleReset}
          />
        </PageCard>
      </div>
      <div className="page-row">
        <div className="playlist-comments-insights-grid">
          <PageCard>
            <LlmSummaryCard
              loading={summaryLoading}
              error={summaryError}
              summary={summaryText}
              maxComments={summaryLimitInput}
              onMaxCommentsChange={setSummaryLimitInput}
              rankBy={summarySortBy}
              onRankByChange={setSummarySortBy}
              onSummarize={handleSummarize}
              disabled={commentsTotal === 0}
            />
          </PageCard>
          <PageCard>
            <CommentsWordCloudCard
              imageUrl={wordCloudImageUrl}
              loading={wordCloudLoading}
              error={wordCloudError}
              wordTypeOptions={WORD_TYPE_OPTIONS}
              selectedWordTypes={wordTypes}
              onWordTypesChange={(next) => setWordTypes(next as typeof wordTypes)}
              onGenerate={handleGenerateWordCloud}
              generateDisabled={commentsTotal === 0}
            />
          </PageCard>
        </div>
      </div>
      <CommentsSection
        groups={commentsGroups}
        loading={commentsLoading}
        error={commentsError}
        loadingText="Loading playlist comments..."
        emptyText="No comments found for this playlist."
        footer={(
          <div className="pagination-footer">
            <div className="pagination-main">
              <PageSwitcher currentPage={commentsPage} totalPages={commentsTotalPages} onPageChange={setCommentsPage} />
            </div>
            <div className="pagination-size">
              <PageSizePicker value={commentsPageSize} onChange={setCommentsPageSize} />
            </div>
          </div>
        )}
      />
    </>
  )
}


import { useEffect, useMemo, useState } from 'react'
import { PageSizePicker, PageSwitcher } from '../../components/ui'
import { CommentsWordCloudCard, LlmSummaryCard, PageCard } from '../../components/cards'
import { CommentFilter, type CommentSort } from '../../components/features'
import { CommentThreadItem, type CommentRow } from '../../components/tables'
import usePagination from '../../hooks/usePagination'
import { useLlmSummary } from '../../hooks/useLlmSummary'
import { useWordCloud, WORD_TYPE_OPTIONS, type WordType } from '../../hooks/useWordCloud'
import { getStored, setStored } from '../../utils/storage'

type CommentThread = {
  parent: CommentRow
  replies: CommentRow[]
  repliesTotal: number
}

type Props = {
  videoId: string | undefined
}

export default function CommentsTab({ videoId }: Props) {
  const [commentsSort, setCommentsSort] = useState<CommentSort>(getStored('videoDetailCommentsSort', 'published_at'))
  const [commentsSearchText, setCommentsSearchText] = useState(getStored('videoDetailCommentsSearchText', ''))
  const [commentsPostedAfter, setCommentsPostedAfter] = useState(getStored('videoDetailCommentsPostedAfter', ''))
  const [commentsPostedBefore, setCommentsPostedBefore] = useState(getStored('videoDetailCommentsPostedBefore', ''))
  const [comments, setComments] = useState<CommentRow[]>([])
  const [commentsTotal, setCommentsTotal] = useState(0)
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsError, setCommentsError] = useState<string | null>(null)
  const {
    page: commentsPage,
    setPage: setCommentsPage,
    pageSize: commentsPageSize,
    setPageSize: setCommentsPageSize,
    totalPages: commentsTotalPages,
  } = usePagination({ total: commentsTotal, defaultPageSize: 10 })
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

  const commentThreads = useMemo<CommentThread[]>(() => {
    const parseTime = (value: string | null) => (value ? new Date(value).getTime() : 0)
    const parseLikes = (value: number | null) => value ?? 0
    const parseReplyCount = (value: number | null | undefined) => value ?? 0
    const compareComments = (a: CommentRow, b: CommentRow) => {
      if (commentsSort === 'likes') return parseLikes(b.like_count) - parseLikes(a.like_count)
      if (commentsSort === 'reply_count') return parseReplyCount(b.reply_count) - parseReplyCount(a.reply_count)
      return parseTime(b.published_at) - parseTime(a.published_at)
    }
    return comments.sort(compareComments).map((comment) => ({
      parent: comment,
      replies: [],
      repliesTotal: comment.reply_count ?? 0,
    }))
  }, [comments, commentsSort])

  useEffect(() => { setCommentsPage(1) }, [videoId])
  useEffect(() => { resetSummary() }, [videoId, resetSummary])
  useEffect(() => { setStored('videoDetailCommentsSort', commentsSort) }, [commentsSort])
  useEffect(() => { setStored('videoDetailCommentsSearchText', commentsSearchText) }, [commentsSearchText])
  useEffect(() => { setStored('videoDetailCommentsPostedAfter', commentsPostedAfter) }, [commentsPostedAfter])
  useEffect(() => { setStored('videoDetailCommentsPostedBefore', commentsPostedBefore) }, [commentsPostedBefore])
  useEffect(() => { setCommentsPage(1) }, [commentsSort, commentsSearchText, commentsPostedAfter, commentsPostedBefore])

  useEffect(() => {
    async function loadComments() {
      if (!videoId) return
      setCommentsLoading(true)
      setCommentsError(null)
      try {
        const offset = (commentsPage - 1) * commentsPageSize
        const params = new URLSearchParams({
          video_id: videoId,
          limit: String(commentsPageSize),
          offset: String(offset),
          sort_by: commentsSort,
          direction: 'desc',
        })
        if (commentsSearchText.trim()) params.set('q', commentsSearchText.trim())
        if (commentsPostedAfter) params.set('published_after', commentsPostedAfter)
        if (commentsPostedBefore) params.set('published_before', commentsPostedBefore)
        const response = await fetch(`http://localhost:8000/comments?${params.toString()}`)
        if (!response.ok) throw new Error(`Failed to load comments (${response.status})`)
        const data = await response.json()
        setComments(Array.isArray(data.items) ? (data.items as CommentRow[]) : [])
        setCommentsTotal(typeof data.total === 'number' ? data.total : 0)
      } catch (err) {
        setCommentsError(err instanceof Error ? err.message : 'Failed to load comments.')
      } finally {
        setCommentsLoading(false)
      }
    }
    loadComments()
  }, [videoId, commentsPage, commentsPageSize, commentsSort, commentsSearchText, commentsPostedAfter, commentsPostedBefore])

  const summarizeVideoComments = () => {
    if (!videoId) return
    summarize({ video_id: videoId })
  }

  const generateVideoWordCloud = () => {
    if (!videoId) return
    const params = new URLSearchParams()
    params.set('video_id', videoId)
    params.set('max_words', '120')
    params.set('min_count', '2')
    if (commentsPostedAfter) params.set('published_after', commentsPostedAfter)
    if (commentsPostedBefore) params.set('published_before', commentsPostedBefore)
    if (commentsSearchText.trim()) params.set('q', commentsSearchText.trim())
    generateWordCloud(params)
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
            sortBy={commentsSort}
            onSortByChange={setCommentsSort}
            onReset={() => { setCommentsSearchText(''); setCommentsPostedAfter(''); setCommentsPostedBefore(''); setCommentsSort('published_at') }}
          />
        </PageCard>
      </div>
      <div className="page-row">
        <div className="video-comments-insights-grid">
          <PageCard>
            <LlmSummaryCard
              loading={summaryLoading}
              error={summaryError}
              summary={summaryText}
              maxComments={summaryLimitInput}
              onMaxCommentsChange={setSummaryLimitInput}
              rankBy={summarySortBy}
              onRankByChange={setSummarySortBy}
              onSummarize={summarizeVideoComments}
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
              onWordTypesChange={(next) => setWordTypes(next as WordType[])}
              onGenerate={generateVideoWordCloud}
              generateDisabled={commentsTotal === 0}
            />
          </PageCard>
        </div>
      </div>
      <div className="page-row">
        <PageCard>
          {commentsLoading ? (
            <div className="video-detail-state">Loading comments...</div>
          ) : commentsError ? (
            <div className="video-detail-state">{commentsError}</div>
          ) : (
            <div className="video-comments">
              {commentThreads.length === 0 ? (
                <div className="video-detail-state">No comments found.</div>
              ) : (
                commentThreads.map((thread) => (
                  <CommentThreadItem key={thread.parent.id} thread={thread} videoId={videoId} />
                ))
              )}
              <div className="pagination-footer">
                <div className="pagination-main">
                  <PageSwitcher currentPage={commentsPage} totalPages={commentsTotalPages} onPageChange={setCommentsPage} />
                </div>
                <div className="pagination-size">
                  <PageSizePicker value={commentsPageSize} onChange={setCommentsPageSize} />
                </div>
              </div>
            </div>
          )}
        </PageCard>
      </div>
    </>
  )
}

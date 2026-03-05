import { useCallback, useEffect, useMemo, useState } from 'react'

export type SummarySort = 'recency' | 'like_count'

/** Scope identifiers for the summarize-comments API call. Supply at most one. */
export type SummaryScope = {
  video_id?: string
  playlist_id?: string
  author_channel_id?: string
}

export type UseLlmSummaryOptions = {
  /** Current comment search/filter text */
  searchText: string
  /** ISO date lower bound for comment posted date */
  postedAfter: string
  /** ISO date upper bound for comment posted date */
  postedBefore: string
}

/**
 * Manages all LLM comment-summary state: limit input, sort, loading/error/text,
 * and the async `summarize(scope)` action.
 *
 * Auto-resets summary text+error whenever searchText, postedAfter, postedBefore,
 * summarySortBy, or summaryLimitInput change.
 */
export function useLlmSummary({ searchText, postedAfter, postedBefore }: UseLlmSummaryOptions) {
  const [summaryLimitInput, setSummaryLimitInput] = useState('50')
  const [summarySortBy, setSummarySortBy] = useState<SummarySort>('recency')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [summaryText, setSummaryText] = useState('')

  const summaryLimit = useMemo(() => {
    const parsed = Number(summaryLimitInput)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null
    }
    return Math.floor(parsed)
  }, [summaryLimitInput])

  // Clear stale summary whenever filters or control inputs change
  useEffect(() => {
    setSummaryText('')
    setSummaryError(null)
  }, [searchText, postedAfter, postedBefore, summarySortBy, summaryLimitInput])

  /** Resets summary state immediately. Call from outside effects when the scoped
   * entity (video/playlist) changes so stale text from the previous entity is cleared. */
  const resetSummary = useCallback(() => {
    setSummaryText('')
    setSummaryError(null)
  }, [])

  /**
   * Sends a summarize request to the API using current filter state.
   * @param scope - Which entity to scope to (video_id, playlist_id, or none for global)
   */
  const summarize = async (scope: SummaryScope = {}) => {
    setSummaryLoading(true)
    setSummaryError(null)
    try {
      const payload: Record<string, unknown> = {
        q: searchText.trim() || null,
        published_after: postedAfter || null,
        published_before: postedBefore || null,
        sort_by: summarySortBy,
      }
      if (scope.video_id) {
        payload.video_id = scope.video_id
      }
      if (scope.playlist_id) {
        payload.playlist_id = scope.playlist_id
      }
      if (scope.author_channel_id) {
        payload.author_channel_id = scope.author_channel_id
      }
      if (summaryLimit !== null) {
        payload.limit_count = summaryLimit
      }
      const response = await fetch('http://localhost:8000/llm/summarize-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json()
      if (!response.ok) {
        throw new Error(typeof body.detail === 'string' ? body.detail : `Failed to summarize comments (${response.status})`)
      }
      setSummaryText(typeof body.summary === 'string' ? body.summary : '')
    } catch (err) {
      setSummaryText('')
      setSummaryError(err instanceof Error ? err.message : 'Failed to summarize comments.')
    } finally {
      setSummaryLoading(false)
    }
  }

  return {
    summaryLimitInput,
    setSummaryLimitInput,
    summarySortBy,
    setSummarySortBy,
    summaryLoading,
    summaryError,
    summaryText,
    resetSummary,
    summarize,
  }
}

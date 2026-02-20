import { useEffect, useMemo, useState } from 'react'
import { CommentsSection, type CommentApiRow } from '../../components/tables'
import { CommentFilter, buildCommentGroups, type CommentSort } from '../../components/features'
import { CommentsWordCloudCard, LlmSummaryCard, PageCard } from '../../components/cards'
import { PageSizePicker, PageSwitcher } from '../../components/ui'
import usePagination from '../../hooks/usePagination'
import { getStored, setStored } from '../../utils/storage'
import '../shared.css'
import './Comments.css'

type StoredCommentsSettings = {
  pageSize?: number
  sortBy?: CommentSort
  searchText?: string
  postedAfter?: string
  postedBefore?: string
  page?: number
  wordTypes?: WordType[]
}

type WordType = 'noun' | 'verb' | 'proper_noun' | 'adjective' | 'adverb'
type SummarySort = 'recency' | 'like_count'

const WORD_TYPE_OPTIONS: Array<{ label: string; value: WordType }> = [
  { label: 'Nouns', value: 'noun' },
  { label: 'Verbs', value: 'verb' },
  { label: 'Proper nouns', value: 'proper_noun' },
  { label: 'Adjectives', value: 'adjective' },
  { label: 'Adverbs', value: 'adverb' },
]

const DEFAULT_WORD_TYPES: WordType[] = ['noun', 'verb', 'proper_noun', 'adjective', 'adverb']

function Comments() {
  const storedSettings = getStored('commentsPageSettings', null as StoredCommentsSettings | null)
  const [sortBy, setSortBy] = useState<CommentSort>(storedSettings?.sortBy ?? 'published_at')
  const [rows, setRows] = useState<CommentApiRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [searchText, setSearchText] = useState(storedSettings?.searchText ?? '')
  const [postedAfter, setPostedAfter] = useState(storedSettings?.postedAfter ?? '')
  const [postedBefore, setPostedBefore] = useState(storedSettings?.postedBefore ?? '')
  const [wordTypes, setWordTypes] = useState<WordType[]>(storedSettings?.wordTypes ?? DEFAULT_WORD_TYPES)
  const [wordCloudImageUrl, setWordCloudImageUrl] = useState('')
  const [wordCloudLoading, setWordCloudLoading] = useState(false)
  const [wordCloudError, setWordCloudError] = useState<string | null>(null)
  const [summaryLimitInput, setSummaryLimitInput] = useState('50')
  const [summarySortBy, setSummarySortBy] = useState<SummarySort>('recency')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [summaryText, setSummaryText] = useState('')
  const { page, setPage, pageSize, setPageSize, totalPages } = usePagination({
    total,
    defaultPage: storedSettings?.page ?? 1,
    defaultPageSize: storedSettings?.pageSize ?? 10,
  })
  const groups = useMemo(() => buildCommentGroups(rows), [rows])
  const summaryLimit = useMemo(() => {
    const parsed = Number(summaryLimitInput)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null
    }
    return Math.floor(parsed)
  }, [summaryLimitInput])

  useEffect(() => {
    async function loadCommentsPage() {
      setLoading(true)
      setError(null)
      try {
        const offset = (page - 1) * pageSize
        const params = new URLSearchParams({
          limit: String(pageSize),
          offset: String(offset),
          sort_by: sortBy,
          direction: 'desc',
        })
        if (postedAfter) {
          params.set('published_after', postedAfter)
        }
        if (postedBefore) {
          params.set('published_before', postedBefore)
        }
        if (searchText.trim()) {
          params.set('q', searchText.trim())
        }
        const response = await fetch(`http://127.0.0.1:8000/comments?${params.toString()}`)
        if (!response.ok) {
          throw new Error(`Failed to load comments (${response.status})`)
        }
        const data = await response.json()
        setRows(Array.isArray(data.items) ? (data.items as CommentApiRow[]) : [])
        setTotal(typeof data.total === 'number' ? data.total : 0)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load comments.')
      } finally {
        setLoading(false)
      }
    }

    loadCommentsPage()
  }, [page, pageSize, postedAfter, postedBefore, sortBy, searchText])

  useEffect(() => {
    return () => {
      if (wordCloudImageUrl) {
        URL.revokeObjectURL(wordCloudImageUrl)
      }
    }
  }, [wordCloudImageUrl])

  useEffect(() => {
    setPage(1)
  }, [searchText, postedAfter, postedBefore, sortBy])

  useEffect(() => {
    setStored('commentsPageSettings', {
      pageSize,
      sortBy,
      searchText,
      postedAfter,
      postedBefore,
      page,
      wordTypes,
    } satisfies StoredCommentsSettings)
  }, [pageSize, sortBy, searchText, postedAfter, postedBefore, page, wordTypes])

  useEffect(() => {
    setSummaryText('')
    setSummaryError(null)
  }, [searchText, postedAfter, postedBefore, summarySortBy, summaryLimitInput])

  const summarizeComments = async () => {
    setSummaryLoading(true)
    setSummaryError(null)
    try {
      const payload: {
        q: string | null
        published_after: string | null
        published_before: string | null
        sort_by: SummarySort
        limit_count?: number
      } = {
        q: searchText.trim() || null,
        published_after: postedAfter || null,
        published_before: postedBefore || null,
        sort_by: summarySortBy,
      }
      if (summaryLimit !== null) {
        payload.limit_count = summaryLimit
      }
      const response = await fetch('http://127.0.0.1:8000/llm/summarize-comments', {
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

  const generateWordCloud = async () => {
    setWordCloudLoading(true)
    setWordCloudError(null)
    try {
      const params = new URLSearchParams({
        max_words: '120',
        min_count: '2',
      })
      if (postedAfter) {
        params.set('published_after', postedAfter)
      }
      if (postedBefore) {
        params.set('published_before', postedBefore)
      }
      if (searchText.trim()) {
        params.set('q', searchText.trim())
      }
      if (wordTypes.length > 0) {
        params.set('word_types', wordTypes.join(','))
      }
      const response = await fetch(`http://127.0.0.1:8000/comments/word-cloud/image?${params.toString()}`)
      if (!response.ok) {
        throw new Error(`Failed to build word cloud (${response.status})`)
      }
      const blob = await response.blob()
      const nextObjectUrl = URL.createObjectURL(blob)
      setWordCloudImageUrl((previousUrl) => {
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl)
        }
        return nextObjectUrl
      })
    } catch (err) {
      setWordCloudImageUrl('')
      setWordCloudError(err instanceof Error ? err.message : 'Failed to build word cloud.')
    } finally {
      setWordCloudLoading(false)
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Comments</h1>
      </header>
      <div className="page-body">
        <div className="page-row">
          <PageCard>
            <CommentFilter
              showTitle
              searchText={searchText}
              onSearchTextChange={setSearchText}
              postedAfter={postedAfter}
              postedBefore={postedBefore}
              onDateRangeChange={(startDate, endDate) => {
                setPostedAfter(startDate)
                setPostedBefore(endDate)
              }}
              sortBy={sortBy}
              onSortByChange={setSortBy}
              onReset={() => {
                setSearchText('')
                setPostedAfter('')
                setPostedBefore('')
                setSortBy('published_at')
              }}
            />
          </PageCard>
        </div>
        <div className="page-row">
          <div className="comments-insights-grid">
            <PageCard>
              <LlmSummaryCard
                loading={summaryLoading}
                error={summaryError}
                summary={summaryText}
                maxComments={summaryLimitInput}
                onMaxCommentsChange={setSummaryLimitInput}
                rankBy={summarySortBy}
                onRankByChange={setSummarySortBy}
                onSummarize={summarizeComments}
                disabled={total === 0}
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
                onGenerate={generateWordCloud}
                generateDisabled={total === 0}
              />
            </PageCard>
          </div>
        </div>
        <CommentsSection
          groups={groups}
          loading={loading}
          error={error}
          footer={(
            <div className="pagination-footer">
              <div className="pagination-main">
                <PageSwitcher currentPage={page} totalPages={totalPages} onPageChange={setPage} />
              </div>
              <div className="pagination-size">
                <PageSizePicker value={pageSize} onChange={setPageSize} />
              </div>
            </div>
          )}
        />
      </div>
    </section>
  )
}

export default Comments



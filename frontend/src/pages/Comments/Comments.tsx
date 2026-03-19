import { useEffect, useState } from 'react'
import { CommentsSection, type CommentApiRow } from '@components/tables'
import { CommentFilter, buildCommentGroups, type CommentSort } from '@components/features'
import { CommentsWordCloudCard, LlmSummaryCard, PageCard } from '@components/cards'
import { PageSizePicker, PageSwitcher } from '@components/ui'
import usePagination from '@hooks/usePagination'
import { useLlmSummary } from '@hooks/useLlmSummary'
import { useWordCloud, WORD_TYPE_OPTIONS, DEFAULT_WORD_TYPES, type WordType } from '@hooks/useWordCloud'
import { getStored, setStored } from '@utils/storage'
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
  const { wordCloudImageUrl, wordCloudLoading, wordCloudError, generateWordCloud: generateWC } = useWordCloud(storedSettings?.wordTypes ?? DEFAULT_WORD_TYPES)
  const { summaryLimitInput, setSummaryLimitInput, summarySortBy, setSummarySortBy, summaryLoading, summaryError, summaryText, summarize } = useLlmSummary({ searchText, postedAfter, postedBefore })
  const { page, setPage, pageSize, setPageSize, totalPages } = usePagination({
    total,
    defaultPage: storedSettings?.page ?? 1,
    defaultPageSize: storedSettings?.pageSize ?? 10,
  })
  const groups = buildCommentGroups(rows)

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
        const response = await fetch(`http://localhost:8000/comments?${params.toString()}`)
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
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const summarizeComments = () => summarize({})

  const generateWordCloud = async () => {
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
      await generateWC(params)
    } catch {
      /* errors handled by hook */
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



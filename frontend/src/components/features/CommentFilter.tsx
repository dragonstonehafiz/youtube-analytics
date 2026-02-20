import { ActionButton, DateRangePicker, Dropdown } from '../ui'
import './CommentFilter.css'

export type CommentSort = 'published_at' | 'likes' | 'reply_count'

type CommentFilterProps = {
  searchText: string
  onSearchTextChange: (value: string) => void
  postedAfter: string
  postedBefore: string
  onDateRangeChange: (startDate: string, endDate: string) => void
  sortBy: CommentSort
  onSortByChange: (value: CommentSort) => void
  onReset: () => void
  showTitle?: boolean
}

function CommentFilter({
  searchText,
  onSearchTextChange,
  postedAfter,
  postedBefore,
  onDateRangeChange,
  sortBy,
  onSortByChange,
  onReset,
  showTitle = false,
}: CommentFilterProps) {
  return (
    <div className="filter-section">
      {showTitle ? <div className="filter-title">Filters</div> : null}
      <div className="filter-grid comment-filter-grid">
        <label className="filter-field">
          <input
            type="text"
            placeholder="Search comment text"
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
          />
        </label>
        <div className="filter-field filter-date">
          <DateRangePicker
            startDate={postedAfter}
            endDate={postedBefore}
            onChange={onDateRangeChange}
          />
        </div>
        <div className="filter-field">
          <Dropdown
            value={sortBy}
            onChange={(value) => onSortByChange(value as CommentSort)}
            placeholder="Date posted"
            items={[
              { type: 'option' as const, label: 'Date posted', value: 'published_at' },
              { type: 'option' as const, label: 'Likes', value: 'likes' },
              { type: 'option' as const, label: 'Reply count', value: 'reply_count' },
            ]}
          />
        </div>
        <div className="filter-actions">
          <ActionButton
            label="Reset"
            onClick={onReset}
            variant="soft"
            className="filter-action"
          />
        </div>
      </div>
    </div>
  )
}

export default CommentFilter

import ActionButton from './ActionButton'
import './PageSwitcher.css'

type PageSwitcherProps = {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  className?: string
}

function PageSwitcher({ currentPage, totalPages, onPageChange, className }: PageSwitcherProps) {
  const safeTotalPages = Math.max(1, totalPages)
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages)
  const rootClassName = ['page-switcher', className ?? ''].filter(Boolean).join(' ')

  return (
    <div className={rootClassName}>
      <ActionButton
        label="<"
        onClick={() => onPageChange(Math.max(1, safeCurrentPage - 1))}
        disabled={safeCurrentPage <= 1}
        variant="soft"
        className="page-switcher-button"
      />
      <span className="page-switcher-label">Page {safeCurrentPage} of {safeTotalPages}</span>
      <ActionButton
        label=">"
        onClick={() => onPageChange(Math.min(safeTotalPages, safeCurrentPage + 1))}
        disabled={safeCurrentPage >= safeTotalPages}
        variant="soft"
        className="page-switcher-button"
      />
    </div>
  )
}

export default PageSwitcher

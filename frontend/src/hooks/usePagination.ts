import { useEffect, useMemo, useState } from 'react'
import { getSharedPageSize, setSharedPageSize } from '../utils/storage'

type PaginationOptions = {
  total: number
  defaultPage?: number
  defaultPageSize?: number
}

type SharedPaginationState = {
  page: number
  setPage: (value: number | ((previous: number) => number)) => void
  pageSize: number
  setPageSize: (value: number | ((previous: number) => number)) => void
  totalPages: number
}

function usePagination({
  total,
  defaultPage = 1,
  defaultPageSize = 10,
}: PaginationOptions): SharedPaginationState {
  const [page, setPage] = useState(defaultPage)
  const [pageSize, setPageSize] = useState(() => getSharedPageSize(defaultPageSize))
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1)
  }, [pageSize])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage((previous) => Math.min(Math.max(1, previous), totalPages))
  }, [totalPages])

  useEffect(() => {
    setSharedPageSize(pageSize)
  }, [pageSize])

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
  }
}

export default usePagination

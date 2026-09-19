import type { UseQueryResult } from '@tanstack/react-query'
import type { Page } from '../../data/contracts/types'
import type { LogView } from './LogTable'

export function toLogView<Row>(query: UseQueryResult<Page<Row>>, page: number, subject: string): LogView<Row> {
  const { data, error, isFetching } = query
  const failed = error !== null && !isFetching
  return {
    rows: data?.items,
    isFetching,
    isPlaceholder: query.isPlaceholderData,
    error: failed ? (data ? error.message : `Couldn’t load ${subject}. ${error.message}`) : null,
    page: query.isPlaceholderData ? page : (data?.page ?? page),
    totalPages: data?.totalPages ?? 1,
  }
}

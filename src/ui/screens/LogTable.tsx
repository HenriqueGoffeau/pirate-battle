import type { ReactNode } from 'react'
import { GoldButton } from '../components/GoldButton'
import { RoundButton } from '../components/RoundButton'
import styles from './LogTable.module.css'

export type LogColumn<Row> = {
  key: string
  label: string
  cell(row: Row): ReactNode
  className?: string
}

export type LogView<Row> = {
  rows: readonly Row[] | undefined
  isFetching: boolean
  isPlaceholder: boolean
  error: string | null
  page: number
  totalPages: number
}

type LogTableProps<Row> = {
  caption: string
  columns: readonly LogColumn<Row>[]
  view: LogView<Row>
  rowKey(row: Row): string
  highlight?(row: Row): boolean
  emptyText: string
  onRetry(): void
  onPage(page: number): void
  onPlay(): void
}

const skeletonRows = 5

export function LogTable<Row>({
  caption,
  columns,
  view,
  rowKey,
  highlight,
  emptyText,
  onRetry,
  onPage,
  onPlay,
}: LogTableProps<Row>) {
  const { rows, isFetching, isPlaceholder, error, page, totalPages } = view

  if (!rows && error) {
    return (
      <div className={styles.message} role="alert">
        <p>{error}</p>
        <GoldButton onClick={onRetry}>Retry</GoldButton>
      </div>
    )
  }

  if (rows && rows.length === 0) {
    return (
      <div className={styles.message}>
        <p>{emptyText}</p>
        <GoldButton onClick={onPlay}>Play</GoldButton>
      </div>
    )
  }

  const pending = !rows
  return (
    <div className={styles.wrap}>
      <p className={styles.state} role="status">
        {pending && 'Loading…'}
        {rows && error && (
          <button type="button" className={styles.retry} onClick={onRetry}>
            Couldn’t refresh · Retry
          </button>
        )}
        {rows && !error && isFetching && 'Refreshing…'}
      </p>
      <div className={styles.scroller}>
        <table className={`${styles.table} ${isPlaceholder ? styles.dimmed : ''}`} aria-busy={pending || isFetching}>
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className={column.className}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pending
              ? Array.from({ length: skeletonRows }, (_, index) => (
                  <tr key={index} className={styles.skeleton} aria-hidden="true">
                    {columns.map((column) => (
                      <td key={column.key}>
                        <span />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => {
                  const current = highlight?.(row) ?? false
                  return (
                    <tr key={rowKey(row)} className={current ? styles.current : undefined} aria-current={current || undefined}>
                      {columns.map((column) => (
                        <td key={column.key} className={column.className}>
                          {column.cell(row)}
                        </td>
                      ))}
                    </tr>
                  )
                })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <nav className={styles.pages} aria-label="Pages">
          <RoundButton
            icon="turnLeft"
            size="small"
            label="Previous page"
            disabled={isPlaceholder || page <= 1}
            onClick={() => onPage(page - 1)}
          />
          <span className={styles.pageText}>
            Page {page} of {totalPages}
          </span>
          <RoundButton
            icon="turnRight"
            size="small"
            label="Next page"
            disabled={isPlaceholder || page >= totalPages}
            onClick={() => onPage(page + 1)}
          />
        </nav>
      )}
    </div>
  )
}

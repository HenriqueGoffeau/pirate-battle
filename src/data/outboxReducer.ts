import type { ApiError, MatchRecord } from './contracts/types'

export type OutboxState = 'pending' | 'submitting' | 'failed'

export type OutboxItem = {
  record: MatchRecord
  state: OutboxState
  attempts: number
  retryAt: number | null
  error: string | null
}

export type OutboxEvent =
  | { type: 'enqueue'; record: MatchRecord }
  | { type: 'submit'; matchId: string }
  | { type: 'confirm'; matchId: string }
  | { type: 'fail'; matchId: string; error: ApiError; now: number }
  | { type: 'retry'; matchId: string }

export const backoffMs = (attempts: number) => Math.min(2000 * 2 ** Math.max(0, attempts - 1), 30_000)

const update = (items: readonly OutboxItem[], matchId: string, change: (item: OutboxItem) => OutboxItem) =>
  items.map((item) => (item.record.matchId === matchId ? change(item) : item))

export function outboxReducer(items: readonly OutboxItem[], event: OutboxEvent): readonly OutboxItem[] {
  switch (event.type) {
    case 'enqueue':
      if (items.some((item) => item.record.matchId === event.record.matchId)) return items
      return [...items, { record: event.record, state: 'pending', attempts: 0, retryAt: null, error: null }]
    case 'submit':
      return update(items, event.matchId, (item) => (item.state === 'pending' ? { ...item, state: 'submitting' } : item))
    case 'confirm':
      return items.filter((item) => item.record.matchId !== event.matchId)
    case 'fail':
      return update(items, event.matchId, (item) => {
        const attempts = item.attempts + 1
        if (!event.error.retryable) return { ...item, state: 'failed', attempts, retryAt: null, error: event.error.message }
        return { ...item, state: 'pending', attempts, retryAt: event.now + backoffMs(attempts), error: event.error.message }
      })
    case 'retry':
      return update(items, event.matchId, (item) => (item.state === 'pending' ? { ...item, retryAt: null } : item))
  }
}

export const restoreOutbox = (items: readonly OutboxItem[]): readonly OutboxItem[] =>
  items.map((item) => (item.state === 'submitting' ? { ...item, state: 'pending' } : item))

export const dueItems = (items: readonly OutboxItem[], now: number) =>
  items.filter((item) => item.state === 'pending' && (item.retryAt ?? 0) <= now)

export function nextRetryAt(items: readonly OutboxItem[]): number | null {
  const times = items.flatMap((item) => (item.state === 'pending' && item.retryAt !== null ? [item.retryAt] : []))
  return times.length > 0 ? Math.min(...times) : null
}

export const waitingCount = (items: readonly OutboxItem[]) => items.filter((item) => item.state !== 'failed').length

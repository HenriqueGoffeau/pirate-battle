import { describe, expect, it } from 'vitest'
import type { ApiError, MatchRecord } from './contracts/types'
import { backoffMs, dueItems, nextRetryAt, outboxReducer, restoreOutbox, waitingCount, type OutboxItem } from './outboxReducer'

const record = (matchId: string) => ({ matchId }) as MatchRecord

const unavailable: ApiError = { status: 503, code: 'server', message: 'Service unavailable.', retryable: true }
const rejected: ApiError = { status: 422, code: 'validation', message: 'Invalid record.', retryable: false }

const enqueue = (items: readonly OutboxItem[], matchId: string) => outboxReducer(items, { type: 'enqueue', record: record(matchId) })

describe('outboxReducer', () => {
  it('enqueues a pending item once per matchId, oldest first', () => {
    const items = enqueue(enqueue(enqueue([], 'a'), 'b'), 'a')
    expect(items.map((item) => [item.record.matchId, item.state, item.attempts])).toEqual([
      ['a', 'pending', 0],
      ['b', 'pending', 0],
    ])
    expect(dueItems(items, 0).map((item) => item.record.matchId)).toEqual(['a', 'b'])
  })

  it('submits and removes the item once the server confirms it', () => {
    const submitting = outboxReducer(enqueue([], 'a'), { type: 'submit', matchId: 'a' })
    expect(submitting[0].state).toBe('submitting')
    expect(dueItems(submitting, 0)).toEqual([])
    expect(outboxReducer(submitting, { type: 'confirm', matchId: 'a' })).toEqual([])
  })

  it('keeps a retryable failure pending with backoff 2, 4, 8, 16 s capped at 30 s', () => {
    let items = enqueue([], 'a')
    const delays: number[] = []
    for (let attempt = 1; attempt <= 6; attempt++) {
      items = outboxReducer(items, { type: 'submit', matchId: 'a' })
      items = outboxReducer(items, { type: 'fail', matchId: 'a', error: unavailable, now: 1000 })
      expect(items[0]).toMatchObject({ state: 'pending', attempts: attempt, error: 'Service unavailable.' })
      delays.push((items[0].retryAt ?? 0) - 1000)
    }
    expect(delays).toEqual([2000, 4000, 8000, 16_000, 30_000, 30_000])
    expect(backoffMs(1)).toBe(2000)
    expect(dueItems(items, 1000 + 29_999)).toEqual([])
    expect(dueItems(items, 1000 + 30_000)).toHaveLength(1)
    expect(nextRetryAt(items)).toBe(31_000)
  })

  it('marks a non-retryable failure as failed and never retries it on its own', () => {
    let items = outboxReducer(enqueue([], 'a'), { type: 'submit', matchId: 'a' })
    items = outboxReducer(items, { type: 'fail', matchId: 'a', error: rejected, now: 0 })
    expect(items[0]).toMatchObject({ state: 'failed', attempts: 1, retryAt: null, error: 'Invalid record.' })
    expect(dueItems(items, Number.MAX_SAFE_INTEGER)).toEqual([])
    expect(outboxReducer(items, { type: 'retry', matchId: 'a' })[0].state).toBe('failed')
    expect(waitingCount(items)).toBe(0)
  })

  it('lets a manual retry skip the backoff', () => {
    let items = outboxReducer(enqueue([], 'a'), { type: 'fail', matchId: 'a', error: unavailable, now: 0 })
    expect(dueItems(items, 0)).toEqual([])
    items = outboxReducer(items, { type: 'retry', matchId: 'a' })
    expect(dueItems(items, 0)).toHaveLength(1)
    expect(nextRetryAt(items)).toBeNull()
  })

  it('turns an item that was in flight during a reload back into pending', () => {
    const items = outboxReducer(enqueue(enqueue([], 'a'), 'b'), { type: 'submit', matchId: 'a' })
    expect(waitingCount(items)).toBe(2)
    expect(restoreOutbox(items).map((item) => item.state)).toEqual(['pending', 'pending'])
  })
})

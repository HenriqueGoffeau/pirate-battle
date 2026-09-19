import { MutationObserver } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import type { MatchConfig } from '../config/matchConfig'
import { readStored, removeStored, writeStored } from '../shared/storage'
import { uuid } from '../shared/uuid'
import { parseMatchRecord } from './contracts/record'
import type { ApiError, EndReason, MatchRecord, SaveOutcome } from './contracts/types'
import { isOffline, toApiError } from './http'
import { loadPlayer } from './local'
import {
  dueItems,
  nextRetryAt,
  outboxReducer,
  restoreOutbox,
  waitingCount,
  type OutboxEvent,
  type OutboxItem,
  type OutboxState,
} from './outboxReducer'
import { queryClient, saveMatchOptions, type SaveVariables } from './queries'

const outboxKey = 'pb:v1:outbox'
const lastResultKey = 'pb:v1:lastResult'

export type LastResult = { record: MatchRecord; status: 'pending' | 'saved' | 'failed'; error: string | null }

export type OutboxSnapshot = { items: readonly OutboxItem[]; lastResult: LastResult | null }

export type SaveStatus =
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'pending'; retryAt: number | null; offline: boolean }
  | { kind: 'failed'; message: string }

export type FinishedMatch = { score: number; effectiveSec: number; endReason: EndReason; matchConfig: MatchConfig }

const itemStates: readonly OutboxState[] = ['pending', 'submitting', 'failed']

function parseItem(value: unknown): OutboxItem | null {
  if (typeof value !== 'object' || value === null) return null
  const { record, state, attempts, retryAt, error } = value as Partial<Record<keyof OutboxItem, unknown>>
  const parsed = parseMatchRecord(record)
  if (!parsed || !itemStates.includes(state as OutboxState)) return null
  return {
    record: parsed,
    state: state as OutboxState,
    attempts: typeof attempts === 'number' ? attempts : 0,
    retryAt: typeof retryAt === 'number' ? retryAt : null,
    error: typeof error === 'string' ? error : null,
  }
}

const parseItems = (data: unknown): OutboxItem[] | null =>
  Array.isArray(data) ? data.flatMap((entry) => parseItem(entry) ?? []) : null

function parseLastResult(value: unknown): LastResult | null {
  if (typeof value !== 'object' || value === null) return null
  const { record, status, error } = value as Partial<Record<keyof LastResult, unknown>>
  const parsed = parseMatchRecord(record)
  if (!parsed || (status !== 'pending' && status !== 'saved' && status !== 'failed')) return null
  return { record: parsed, status, error: typeof error === 'string' ? error : null }
}

let snapshot: OutboxSnapshot | null = null
let started = false
let draining = false
let timer: number | undefined
const listeners = new Set<() => void>()
const controllers = new Map<string, AbortController>()

function current(): OutboxSnapshot {
  snapshot ??= {
    items: restoreOutbox(readStored(outboxKey, parseItems) ?? []),
    lastResult: readStored(lastResultKey, parseLastResult),
  }
  return snapshot
}

function commit(next: OutboxSnapshot): void {
  const previous = current()
  snapshot = next
  if (next.items !== previous.items) writeStored(outboxKey, next.items)
  if (next.lastResult !== previous.lastResult) {
    if (next.lastResult) writeStored(lastResultKey, next.lastResult)
    else removeStored(lastResultKey)
  }
  listeners.forEach((listener) => listener())
}

function followLastResult(lastResult: LastResult | null, event: OutboxEvent, items: readonly OutboxItem[]): LastResult | null {
  if (!lastResult || !('matchId' in event) || event.matchId !== lastResult.record.matchId) return lastResult
  if (event.type === 'confirm') return { ...lastResult, status: 'saved', error: null }
  const item = items.find((entry) => entry.record.matchId === event.matchId)
  if (event.type === 'fail' && item?.state === 'failed') return { ...lastResult, status: 'failed', error: item.error }
  return lastResult
}

function dispatch(event: OutboxEvent): void {
  const state = current()
  const items = outboxReducer(state.items, event)
  commit({ items, lastResult: followLastResult(state.lastResult, event, items) })
}

async function submit(item: OutboxItem): Promise<void> {
  const { matchId } = item.record
  const controller = new AbortController()
  controllers.set(matchId, controller)
  dispatch({ type: 'submit', matchId })
  const observer = new MutationObserver<SaveOutcome, ApiError, SaveVariables>(queryClient, saveMatchOptions)
  try {
    await observer.mutate({ record: item.record, signal: controller.signal })
    dispatch({ type: 'confirm', matchId })
  } catch (error) {
    dispatch({ type: 'fail', matchId, error: toApiError(error), now: Date.now() })
  } finally {
    controllers.delete(matchId)
    observer.reset()
  }
}

async function drain(): Promise<void> {
  for (;;) {
    const item = dueItems(current().items, Date.now()).find((entry) => !controllers.has(entry.record.matchId))
    if (!item) return
    await submit(item)
  }
}

function schedule(): void {
  window.clearTimeout(timer)
  const at = nextRetryAt(current().items)
  if (at !== null) timer = window.setTimeout(flushOutbox, Math.max(0, at - Date.now()))
}

export function flushOutbox(): void {
  if (draining || isOffline()) return
  draining = true
  void drain().finally(() => {
    draining = false
    schedule()
  })
}

export function startOutbox(): void {
  if (started) return
  started = true
  window.addEventListener('online', flushOutbox)
  flushOutbox()
}

export function recordFinishedMatch(match: FinishedMatch): MatchRecord {
  const player = loadPlayer()
  const { matchConfig } = match
  const record: MatchRecord = {
    matchId: uuid(),
    playerId: player.playerId,
    playerName: player.name,
    playedAt: new Date().toISOString(),
    score: match.score,
    effectiveSec: match.effectiveSec,
    endReason: match.endReason,
    configKey: matchConfig.configKey,
    custom: matchConfig.custom,
    config: matchConfig,
  }
  const state = current()
  commit({
    items: outboxReducer(state.items, { type: 'enqueue', record }),
    lastResult: { record, status: 'pending', error: null },
  })
  flushOutbox()
  return record
}

export function retrySave(matchId: string): void {
  dispatch({ type: 'retry', matchId })
  flushOutbox()
}

export function clearOutbox(): void {
  controllers.forEach((controller) => controller.abort())
  const { lastResult } = current()
  commit({
    items: [],
    lastResult: lastResult?.status === 'pending' ? { ...lastResult, status: 'failed', error: 'Removed from the outbox.' } : lastResult,
  })
  schedule()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useOutbox = (): OutboxSnapshot => useSyncExternalStore(subscribe, current)

export const pendingCount = (snapshot: OutboxSnapshot) => waitingCount(snapshot.items)

export const failedCount = (snapshot: OutboxSnapshot) => snapshot.items.filter((item) => item.state === 'failed').length

export function saveStatusOf(snapshot: OutboxSnapshot, matchId: string): SaveStatus {
  const item = snapshot.items.find((entry) => entry.record.matchId === matchId)
  if (item?.state === 'failed') return { kind: 'failed', message: item.error ?? 'The server rejected this battle.' }
  if (item && isOffline()) return { kind: 'pending', retryAt: null, offline: true }
  if (item && (item.state === 'submitting' || item.attempts === 0)) return { kind: 'saving' }
  if (item) return { kind: 'pending', retryAt: item.retryAt, offline: false }
  const last = snapshot.lastResult?.record.matchId === matchId ? snapshot.lastResult : null
  if (last?.status === 'saved') return { kind: 'saved' }
  return { kind: 'failed', message: last?.error ?? 'This battle is no longer queued.' }
}

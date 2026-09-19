import type { ScenarioId } from './scenarios'

export type RequestLogEntry = {
  id: number
  method: string
  path: string
  scenario: ScenarioId
  status: number | 'network error' | null
  ms: number | null
}

const limit = 30

let entries: readonly RequestLogEntry[] = []
let nextId = 1
const listeners = new Set<() => void>()

const notify = () => listeners.forEach((listener) => listener())

export function beginRequest(method: string, path: string, scenario: ScenarioId): number {
  const id = nextId++
  entries = [...entries, { id, method, path, scenario, status: null, ms: null }].slice(-limit)
  notify()
  return id
}

export function endRequest(id: number, status: RequestLogEntry['status'], ms: number): void {
  entries = entries.map((entry) => (entry.id === id ? { ...entry, status, ms } : entry))
  notify()
}

export function clearRequestLog(): void {
  entries = []
  notify()
}

export const getRequestLog = () => entries

export function subscribeRequestLog(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

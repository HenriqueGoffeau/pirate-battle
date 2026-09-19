import { parseMatchRecord } from './contracts/record'
import type { ConfigSummary, MatchRecord, Page, RankingEntry, SaveOutcome } from './contracts/types'
import { apiError, http } from './http'

type PageQuery = { page: number; pageSize: number }

const unexpected = (status: number) => apiError(status, 'server', 'The server sent an unexpected response.', false)

function expectPage<T>(data: unknown, status: number): Page<T> {
  if (typeof data !== 'object' || data === null) throw unexpected(status)
  const page = data as Partial<Page<T>>
  if (!Array.isArray(page.items) || typeof page.page !== 'number' || typeof page.totalPages !== 'number') throw unexpected(status)
  return page as Page<T>
}

export async function getRanking(query: PageQuery & { configKey: string }, signal: AbortSignal): Promise<Page<RankingEntry>> {
  const response = await http.get<unknown>('/ranking', { params: query, signal })
  return expectPage<RankingEntry>(response.data, response.status)
}

export async function getRankingConfigs(signal: AbortSignal): Promise<ConfigSummary[]> {
  const response = await http.get<unknown>('/ranking/configs', { signal })
  if (!Array.isArray(response.data)) throw unexpected(response.status)
  return response.data as ConfigSummary[]
}

export async function getHistory(query: PageQuery & { playerId: string }, signal: AbortSignal): Promise<Page<MatchRecord>> {
  const { playerId, ...params } = query
  const response = await http.get<unknown>(`/players/${encodeURIComponent(playerId)}/matches`, { params, signal })
  return expectPage<MatchRecord>(response.data, response.status)
}

export async function putMatch(record: MatchRecord, signal: AbortSignal): Promise<SaveOutcome> {
  const response = await http.put<unknown>(`/matches/${encodeURIComponent(record.matchId)}`, record, { signal })
  const saved = parseMatchRecord(response.data)
  if (!saved) throw unexpected(response.status)
  return { record: saved, created: response.status === 201 }
}

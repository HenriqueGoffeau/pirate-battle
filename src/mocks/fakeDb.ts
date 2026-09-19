import { compareRanking } from '../data/contracts/ranking'
import { parseMatchRecord } from '../data/contracts/record'
import type { ConfigSummary, MatchRecord, Page, RankingEntry } from '../data/contracts/types'
import { clamp, deepEqual } from '../shared/math'
import { readStored, writeStored } from '../shared/storage'
import { fixtureRecords, ownRecords } from './fixtures'
import type { Dataset } from './scenarios'

type Owner = { playerId: string; name: string }
type DbState = { dataset: Dataset; records: MatchRecord[] }
export type InsertOutcome = { outcome: 'created' | 'existing' | 'conflict'; record: MatchRecord }

const dbKey = 'pb:v1:mockDb'
const maxRecords = 500
const datasets: readonly Dataset[] = ['fixtures', 'empty', 'manyPages']

let db: DbState = { dataset: 'fixtures', records: [] }

function parseDb(value: unknown): DbState | null {
  if (typeof value !== 'object' || value === null) return null
  const { dataset, records } = value as Partial<Record<keyof DbState, unknown>>
  if (!datasets.includes(dataset as Dataset) || !Array.isArray(records)) return null
  return { dataset: dataset as Dataset, records: records.flatMap((record) => parseMatchRecord(record) ?? []) }
}

const persist = () => writeStored(dbKey, db)

function seedRecords(dataset: Dataset, owner: Owner): MatchRecord[] {
  if (dataset === 'empty') return []
  return dataset === 'manyPages' ? [...fixtureRecords(), ...ownRecords(owner)] : fixtureRecords()
}

export function resetDb(dataset: Dataset, owner: Owner): void {
  db = { dataset, records: seedRecords(dataset, owner) }
  persist()
}

export function loadDb(dataset: Dataset, owner: Owner): void {
  const stored = readStored(dbKey, parseDb)
  if (stored && stored.dataset === dataset) db = stored
  else resetDb(dataset, owner)
}

const byNewest = (a: MatchRecord, b: MatchRecord) => Date.parse(b.playedAt) - Date.parse(a.playedAt) || (a.matchId < b.matchId ? 1 : -1)

export function insertRecord(record: MatchRecord): InsertOutcome {
  const existing = db.records.find((entry) => entry.matchId === record.matchId)
  if (existing) return { outcome: deepEqual(existing, record) ? 'existing' : 'conflict', record: existing }
  db.records.push(record)
  if (db.records.length > maxRecords) db.records = [...db.records].sort(byNewest).slice(0, maxRecords)
  persist()
  return { outcome: 'created', record }
}

function paginate<T, R>(items: readonly T[], page: number, pageSize: number, map: (item: T, index: number) => R): Page<R> {
  const totalItems = items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const current = clamp(page, 1, totalPages)
  const start = (current - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize).map((item, offset) => map(item, start + offset)),
    page: current,
    pageSize,
    totalItems,
    totalPages,
    serverTime: new Date().toISOString(),
  }
}

export function rankingPage(configKey: string, page: number, pageSize: number, viewerId: string): Page<RankingEntry> {
  const ranked = db.records.filter((record) => record.configKey === configKey && !record.custom).sort(compareRanking)
  return paginate(ranked, page, pageSize, (record, index) => ({
    rank: index + 1,
    matchId: record.matchId,
    playerId: record.playerId,
    playerName: record.playerName,
    score: record.score,
    effectiveSec: record.effectiveSec,
    playedAt: record.playedAt,
    isYou: record.playerId === viewerId,
  }))
}

export function historyPage(playerId: string, page: number, pageSize: number): Page<MatchRecord> {
  const mine = db.records.filter((record) => record.playerId === playerId).sort(byNewest)
  return paginate(mine, page, pageSize, (record) => record)
}

export function configSummaries(): ConfigSummary[] {
  const summaries = new Map<string, ConfigSummary>()
  for (const record of db.records) {
    if (record.custom) continue
    const summary = summaries.get(record.configKey)
    if (summary) summary.matches += 1
    else {
      const { sessionSeconds, spawnIntervalSec } = record.config
      summaries.set(record.configKey, { configKey: record.configKey, sessionSeconds, spawnIntervalSec, matches: 1 })
    }
  }
  return [...summaries.values()].sort((a, b) => b.matches - a.matches || (a.configKey < b.configKey ? -1 : 1))
}

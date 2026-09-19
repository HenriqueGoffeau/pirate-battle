import type { MatchConfig } from '../../config/matchConfig'

export type EndReason = 'timeUp' | 'defeated'

export type MatchRecord = {
  matchId: string
  playerId: string
  playerName: string
  playedAt: string
  score: number
  effectiveSec: number
  endReason: EndReason
  configKey: string
  custom: boolean
  config: MatchConfig
}

export type RankingEntry = {
  rank: number
  matchId: string
  playerId: string
  playerName: string
  score: number
  effectiveSec: number
  playedAt: string
  isYou: boolean
}

export type Page<T> = {
  items: T[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  serverTime: string
}

export type ConfigSummary = { configKey: string; sessionSeconds: number; spawnIntervalSec: number; matches: number }

export type ApiErrorCode = 'not_found' | 'validation' | 'conflict' | 'server' | 'network' | 'timeout'

export type ApiError = { status: number; code: ApiErrorCode; message: string; retryable: boolean }

export type ApiErrorBody = { code: ApiErrorCode; message: string }

export type SaveOutcome = { record: MatchRecord; created: boolean }

export const pageSize = 5

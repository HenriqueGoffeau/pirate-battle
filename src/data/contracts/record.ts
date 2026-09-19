import { configKey, isCustomBalance, type MatchConfig } from '../../config/matchConfig'
import { validateOptions } from '../../config/userOptions'
import { isUuid } from '../../shared/uuid'
import { validatePlayerName } from '../local'
import type { MatchRecord } from './types'

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0

const isInstant = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value))

function parseConfig(value: unknown): MatchConfig | null {
  if (typeof value !== 'object' || value === null) return null
  const config = value as Partial<Record<keyof MatchConfig, unknown>>
  if (!validateOptions(config).ok || typeof config.seed !== 'number') return null
  if (typeof config.configKey !== 'string' || typeof config.custom !== 'boolean') return null
  return value as MatchConfig
}

export function parseMatchRecord(value: unknown): MatchRecord | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Partial<Record<keyof MatchRecord, unknown>>
  const { matchId, playerId, playerName, playedAt, score, effectiveSec, endReason, custom } = record
  const config = parseConfig(record.config)
  if (!isUuid(matchId) || !isUuid(playerId) || !isInstant(playedAt)) return null
  if (typeof playerName !== 'string' || validatePlayerName(playerName) !== null) return null
  if (!isCount(score) || !isCount(effectiveSec)) return null
  if (endReason !== 'timeUp' && endReason !== 'defeated') return null
  if (typeof record.configKey !== 'string' || typeof custom !== 'boolean' || !config) return null
  return { matchId, playerId, playerName, playedAt, score, effectiveSec, endReason, configKey: record.configKey, custom, config }
}

export function recordProblem(record: MatchRecord): string | null {
  const { config } = record
  if (record.configKey !== configKey(config)) return `configKey ${record.configKey} does not match the config (${configKey(config)}).`
  if (config.configKey !== record.configKey) return 'config.configKey does not match the record.'
  if (record.custom !== isCustomBalance(config)) return 'The custom flag does not match the balance in the config.'
  if (record.effectiveSec > config.sessionSeconds) return 'effectiveSec is longer than the session.'
  return null
}

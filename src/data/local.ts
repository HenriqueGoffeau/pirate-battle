import { validateBalance } from '../config/balance'
import { GameConfig, type BalanceConfig } from '../config/gameConfig'
import { defaultOptions, validateOptions, type UserOptions } from '../config/userOptions'
import { readStored, removeStored, writeStored } from '../shared/storage'
import { isUuid, uuid } from '../shared/uuid'

const optionsKey = 'pb:v1:options'
const playerKey = 'pb:v1:player'
const devKey = 'pb:v1:dev'
const devBalanceKey = 'pb:v1:devBalance'

export type PlayerProfile = { playerId: string; name: string }

export const defaultPlayerName = 'Captain Jack'
export const nameLimits = { min: 2, max: 20 } as const

const namePattern = /^[\p{L}\p{N} '.-]+$/u

export function loadOptions(): UserOptions {
  const stored = readStored(optionsKey, (data) => {
    const result = validateOptions(data)
    return result.ok ? result.options : null
  })
  return stored ?? defaultOptions
}

export function saveOptions(options: UserOptions): boolean {
  return writeStored(optionsKey, options)
}

export const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ')

export function validatePlayerName(name: string): string | null {
  const normalized = normalizeName(name)
  if (normalized.length < nameLimits.min || normalized.length > nameLimits.max) {
    return `Use ${nameLimits.min} to ${nameLimits.max} characters.`
  }
  if (!namePattern.test(normalized)) return "Use letters, numbers, spaces, ' . or -."
  return null
}

function parsePlayer(data: unknown): PlayerProfile | null {
  if (typeof data !== 'object' || data === null) return null
  const { playerId, name } = data as Partial<Record<keyof PlayerProfile, unknown>>
  if (!isUuid(playerId)) return null
  if (typeof name !== 'string' || validatePlayerName(name) !== null) return null
  return { playerId, name: normalizeName(name) }
}

export function loadPlayer(): PlayerProfile {
  const stored = readStored(playerKey, parsePlayer)
  if (stored) return stored
  const player = { playerId: uuid(), name: defaultPlayerName }
  writeStored(playerKey, player)
  return player
}

export function renamePlayer(player: PlayerProfile, name: string): PlayerProfile {
  const renamed = { ...player, name: normalizeName(name) }
  writeStored(playerKey, renamed)
  return renamed
}

export function loadDevMode(): boolean {
  return readStored(devKey, (data) => (data === true ? true : null)) ?? false
}

export function saveDevMode(enabled: boolean): void {
  if (enabled) writeStored(devKey, true)
  else removeStored(devKey)
}

export function loadDevBalance(): BalanceConfig | null {
  return readStored(devBalanceKey, (data) => {
    const result = validateBalance(data)
    return result.ok ? result.balance : null
  })
}

export function saveDevBalance(balance: BalanceConfig): boolean {
  return writeStored(devBalanceKey, balance)
}

export function clearDevBalance(): void {
  removeStored(devBalanceKey)
}

export function loadMatchBalance(): BalanceConfig {
  if (!loadDevMode()) return GameConfig
  return loadDevBalance() ?? GameConfig
}

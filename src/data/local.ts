import { defaultOptions, validateOptions, type UserOptions } from '../config/userOptions'
import { readStored, writeStored } from '../shared/storage'
import { uuid } from '../shared/uuid'

const optionsKey = 'pb:v1:options'
const playerKey = 'pb:v1:player'

export type PlayerProfile = { playerId: string; name: string }

export const defaultPlayerName = 'Captain Jack'
export const nameLimits = { min: 2, max: 20 } as const

const namePattern = /^[\p{L}\p{N} '.-]+$/u
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

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
  if (typeof playerId !== 'string' || !uuidPattern.test(playerId)) return null
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

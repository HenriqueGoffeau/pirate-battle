import { GameConfig, type BalanceConfig } from './gameConfig'

export type BalanceValidation = { ok: true; balance: BalanceConfig } | { ok: false; error: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function shapeError(value: unknown, reference: unknown, path: string): string | null {
  const where = path || 'The balance'
  if (typeof reference === 'number') {
    return typeof value === 'number' && Number.isFinite(value) ? null : `${where} must be a number.`
  }
  if (typeof reference === 'string') return typeof value === 'string' ? null : `${where} must be text.`
  if (typeof reference === 'boolean') return typeof value === 'boolean' ? null : `${where} must be true or false.`
  if (Array.isArray(reference)) {
    if (!Array.isArray(value)) return `${where} must be a list.`
    if (reference.length === 0) return value.length === 0 ? null : `${where} must stay empty.`
    for (const [index, item] of value.entries()) {
      const error = shapeError(item, reference[0], `${path}[${index}]`)
      if (error) return error
    }
    return null
  }
  if (!isRecord(value) || !isRecord(reference)) return `${where} must be an object.`
  for (const key of Object.keys(reference)) {
    const child = path ? `${path}.${key}` : key
    if (!(key in value)) return `${child} is missing.`
    const error = shapeError(value[key], reference[key], child)
    if (error) return error
  }
  const extra = Object.keys(value).find((key) => !(key in reference))
  return extra ? `${path ? `${path}.` : ''}${extra} is not a balance setting.` : null
}

export function validateBalance(value: unknown): BalanceValidation {
  const error = shapeError(value, GameConfig, '')
  return error ? { ok: false, error } : { ok: true, balance: value as BalanceConfig }
}

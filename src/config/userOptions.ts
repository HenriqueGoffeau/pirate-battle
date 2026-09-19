export type UserOptions = { sessionSeconds: number; spawnIntervalSec: number }

export type OptionKey = keyof UserOptions

export const OptionLimits = {
  sessionSeconds: { min: 60, max: 180, step: 10, default: 120 },
  spawnIntervalSec: { min: 1, max: 10, step: 1, default: 3 },
} as const

export const optionKeys: readonly OptionKey[] = ['sessionSeconds', 'spawnIntervalSec']

export const defaultOptions: UserOptions = {
  sessionSeconds: OptionLimits.sessionSeconds.default,
  spawnIntervalSec: OptionLimits.spawnIntervalSec.default,
}

export type OptionErrors = Partial<Record<OptionKey, string>>

export type OptionsValidation = { ok: true; options: UserOptions } | { ok: false; errors: OptionErrors }

export function validateOption(key: OptionKey, value: unknown): string | null {
  const { min, max, step } = OptionLimits[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Enter a number of seconds.'
  if (!Number.isInteger(value)) return 'Use whole seconds.'
  if (value < min || value > max) return `Choose between ${min} and ${max} seconds.`
  if ((value - min) % step !== 0) return `Use steps of ${step} seconds.`
  return null
}

export function validateOptions(value: unknown): OptionsValidation {
  const source: Partial<Record<OptionKey, unknown>> = typeof value === 'object' && value !== null ? value : {}
  const errors: OptionErrors = {}
  for (const key of optionKeys) {
    const error = validateOption(key, source[key])
    if (error) errors[key] = error
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    options: { sessionSeconds: source.sessionSeconds as number, spawnIntervalSec: source.spawnIntervalSec as number },
  }
}

export type UserOptions = { sessionSeconds: number; spawnIntervalSec: number }

export const OptionLimits = {
  sessionSeconds: { min: 60, max: 180, step: 10, default: 120 },
  spawnIntervalSec: { min: 1, max: 10, step: 1, default: 3 },
} as const

export const defaultOptions: UserOptions = {
  sessionSeconds: OptionLimits.sessionSeconds.default,
  spawnIntervalSec: OptionLimits.spawnIntervalSec.default,
}

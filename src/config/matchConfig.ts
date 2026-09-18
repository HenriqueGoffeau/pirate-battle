import { deepEqual, deepFreeze } from '../shared/math'
import { GameConfig, type BalanceConfig } from './gameConfig'
import type { UserOptions } from './userOptions'

export type MatchConfig = BalanceConfig & UserOptions & { configKey: string; custom: boolean; seed: number }

export const configKey = (options: UserOptions) => `s${options.sessionSeconds}-i${options.spawnIntervalSec}`

export function createMatchConfig(options: UserOptions, seed: number, balance: BalanceConfig = GameConfig): MatchConfig {
  return deepFreeze({
    ...structuredClone(balance),
    ...options,
    configKey: configKey(options),
    custom: !deepEqual(balance, GameConfig),
    seed,
  })
}

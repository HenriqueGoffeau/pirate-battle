import { createMatchConfig } from '../config/matchConfig'
import type { EndReason, MatchRecord } from '../data/contracts/types'

type Outcome = readonly [
  sessionSeconds: number,
  spawnIntervalSec: number,
  score: number,
  effectiveSec: number,
  endReason: EndReason,
  playedAt: string,
]

type Owner = { playerId: string; name: string }

const captains: ReadonlyArray<readonly [name: string, ...outcome: Outcome]> = [
  ['Captain Flint', 120, 3, 38, 120, 'timeUp', '2026-09-08T19:42:00.000Z'],
  ['Red Sparrow', 120, 3, 32, 120, 'timeUp', '2026-09-07T20:15:00.000Z'],
  ['Storm Rider', 120, 3, 21, 120, 'timeUp', '2026-09-06T18:03:00.000Z'],
  ['Sea Wolf', 120, 3, 19, 120, 'timeUp', '2026-09-04T17:48:00.000Z'],
  ['Anne Bonny', 120, 3, 17, 120, 'timeUp', '2026-09-03T22:10:00.000Z'],
  ['Iron Kate', 120, 3, 15, 88, 'defeated', '2026-09-05T21:30:00.000Z'],
  ['Black Bart', 120, 3, 15, 120, 'timeUp', '2026-09-03T13:25:00.000Z'],
  ['Tide Runner', 120, 3, 12, 120, 'timeUp', '2026-09-02T16:40:00.000Z'],
  ['Gull Eye', 120, 3, 12, 120, 'timeUp', '2026-09-05T09:05:00.000Z'],
  ['Coral Fang', 120, 3, 11, 74, 'defeated', '2026-09-01T19:55:00.000Z'],
  ['Old Barnacle', 120, 3, 9, 61, 'defeated', '2026-08-31T20:20:00.000Z'],
  ['Mary Read', 120, 3, 8, 45, 'defeated', '2026-08-30T18:35:00.000Z'],
  ['Calico Jack', 180, 2, 41, 180, 'timeUp', '2026-09-08T20:05:00.000Z'],
  ["Grace O'Malley", 180, 2, 35, 180, 'timeUp', '2026-09-07T18:22:00.000Z'],
  ['Salt Hawk', 180, 2, 29, 180, 'timeUp', '2026-09-06T21:14:00.000Z'],
  ['Silver Finn', 180, 2, 26, 131, 'defeated', '2026-09-06T12:40:00.000Z'],
  ['Rum Runner', 180, 2, 26, 180, 'timeUp', '2026-09-05T19:33:00.000Z'],
  ['Kraken Kid', 180, 2, 22, 180, 'timeUp', '2026-09-04T20:51:00.000Z'],
  ['Mad Maggie', 180, 2, 18, 102, 'defeated', '2026-09-03T18:17:00.000Z'],
  ['Driftwood', 180, 2, 16, 180, 'timeUp', '2026-09-02T21:09:00.000Z'],
  ['Jade Cutlass', 180, 2, 14, 180, 'timeUp', '2026-09-01T17:44:00.000Z'],
  ['Bosun Bell', 180, 2, 11, 76, 'defeated', '2026-08-31T22:30:00.000Z'],
  ['Stormy Pete', 180, 2, 9, 180, 'timeUp', '2026-08-30T19:58:00.000Z'],
  ['Captain Vane', 180, 2, 8, 53, 'defeated', '2026-08-29T20:26:00.000Z'],
]

const ownBattles: readonly Outcome[] = [
  [120, 3, 24, 120, 'timeUp', '2026-09-08T21:42:00.000Z'],
  [120, 3, 16, 120, 'timeUp', '2026-09-07T19:05:00.000Z'],
  [120, 3, 7, 58, 'defeated', '2026-09-06T20:30:00.000Z'],
  [180, 2, 30, 180, 'timeUp', '2026-09-05T18:12:00.000Z'],
  [180, 2, 12, 97, 'defeated', '2026-09-04T21:00:00.000Z'],
  [180, 2, 19, 180, 'timeUp', '2026-09-03T17:25:00.000Z'],
  [180, 2, 5, 40, 'defeated', '2026-09-02T22:48:00.000Z'],
]

const fixtureId = (prefix: string, index: number) => `${prefix}-0000-4000-8000-${String(index + 1).padStart(12, '0')}`

function toRecord(matchId: string, owner: Owner, outcome: Outcome, seed: number): MatchRecord {
  const [sessionSeconds, spawnIntervalSec, score, effectiveSec, endReason, playedAt] = outcome
  const config = createMatchConfig({ sessionSeconds, spawnIntervalSec }, seed)
  return {
    matchId,
    playerId: owner.playerId,
    playerName: owner.name,
    playedAt,
    score,
    effectiveSec,
    endReason,
    configKey: config.configKey,
    custom: config.custom,
    config,
  }
}

export const fixtureRecords = (): MatchRecord[] =>
  captains.map(([name, ...outcome], index) =>
    toRecord(fixtureId('ba771e00', index), { playerId: fixtureId('c0ffee00', index), name }, outcome, 1000 + index),
  )

export const ownRecords = (owner: Owner): MatchRecord[] =>
  ownBattles.map((outcome, index) => toRecord(fixtureId('5e1f0000', index), owner, outcome, 2000 + index))

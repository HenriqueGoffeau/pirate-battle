import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseTiledMap } from '../assets/parseTiledMap'
import { createMatchConfig } from '../config/matchConfig'
import { defaultOptions } from '../config/userOptions'
import { ManualClock } from '../shared/clock'
import { idleIntent, type ShipIntent } from '../shared/intent'
import type { World } from '../sim/entities'
import { step } from '../sim/step'
import { createWorld } from '../sim/world'
import { startLoop } from './loop'

const map = parseTiledMap('archipelago-1', JSON.parse(readFileSync('public/maps/archipelago-1.json', 'utf8')))

function scripted(tick: number): ShipIntent {
  const intent = idleIntent()
  intent.thrust = tick % 400 < 300 ? 1 : 0
  intent.turn = [1, 0, -1][Math.floor(tick / 120) % 3]
  intent.fire.front = tick % 50 < 25
  intent.fire.left = tick % 170 < 4
  return intent
}

const fingerprint = (world: World) =>
  JSON.stringify([world.time.toFixed(6), world.score, world.spawned, world.ships.map((s) => [s.id, s.x.toFixed(4), s.y.toFixed(4), s.health])])

function run(seed: number, chunkMs: number, totalMs = 60_000): World {
  const world = createWorld(createMatchConfig(defaultOptions, seed), map)
  const clock = new ManualClock()
  let tick = 0
  const stop = startLoop(clock, { isRunning: () => !world.ended, step: (dt) => step(world, dt, scripted(tick++)), render: () => {} })
  for (let elapsed = 0; elapsed < totalMs; elapsed += chunkMs) clock.advance(chunkMs)
  stop()
  return world
}

describe('simulation determinism under ManualClock', () => {
  it('repeats a seeded run exactly, however time is fed, and differs across seeds', () => {
    const reference = fingerprint(run(42, 1000))
    expect(fingerprint(run(42, 1000))).toBe(reference)
    expect(fingerprint(run(42, 7))).toBe(reference)
    expect(fingerprint(run(43, 1000))).not.toBe(reference)
  })
})

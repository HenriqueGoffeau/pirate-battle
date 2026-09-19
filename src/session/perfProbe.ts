import type { Application } from 'pixi.js'
import type { World } from '../sim/entities'
import type { MatchState } from './store'

export type PerfSample = {
  t: number
  fps: number
  p95: number
  ships: number
  shots: number
  fx: number
  heapMB: number | null
}

export type PerfSummary = {
  frames: number
  durationSec: number
  meanFps: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
  maxMs: number
  over20Ms: number
  over33Ms: number
  peakShips: number
  peakShots: number
  peakFx: number
  heapStartMB: number | null
  heapEndMB: number | null
  heapPeakMB: number | null
  endReason: string | null
}

export type PerfReport = {
  meta: {
    userAgent: string
    devicePixelRatio: number
    viewport: { width: number; height: number }
    canvas: { width: number; height: number }
    renderer: string
    gpu: string | null
    commit: string | null
    createdAt: string
  }
  config: { sessionSeconds: number; spawnIntervalSec: number; configKey: string; seed: number; custom: boolean }
  summary: PerfSummary
  samples: PerfSample[]
}

type Run = {
  world: World
  app: Application
  last: number
  frames: number
  totalMs: number
  maxMs: number
  over20: number
  over33: number
  windowFrames: number
  windowMs: number
  peakShips: number
  peakShots: number
  peakFx: number
  heapStart: number | null
  heapPeak: number | null
  samples: PerfSample[]
  done: boolean
}

type MemoryInfo = { usedJSHeapSize: number }

const historySize = 1 << 16
const windowSize = 1024
const slowFrameMs = 20
const longFrameMs = 33
const bytesPerMB = 1024 * 1024

let enabled = false
let frameTimes = new Float32Array(0)
let windowTimes = new Float32Array(0)
let run: Run | null = null

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits

function frameTime(): number {
  const time = document.timeline.currentTime
  return typeof time === 'number' ? time : performance.now()
}

function heapMB(): number | null {
  const memory = (performance as Performance & { memory?: MemoryInfo }).memory
  return memory ? round(memory.usedJSHeapSize / bytesPerMB, 1) : null
}

const maxHeap = (peak: number | null, heap: number | null) => (heap === null ? peak : Math.max(peak ?? heap, heap))

function percentile(sorted: Float32Array, fraction: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))]
}

function aliveShips(world: World): number {
  let count = 0
  for (const ship of world.ships) if (ship.alive) count += 1
  return count
}

function startRun(world: World, app: Application, now: number): Run {
  const heap = heapMB()
  return {
    world,
    app,
    last: now,
    frames: 0,
    totalMs: 0,
    maxMs: 0,
    over20: 0,
    over33: 0,
    windowFrames: 0,
    windowMs: 0,
    peakShips: 0,
    peakShots: 0,
    peakFx: 0,
    heapStart: heap,
    heapPeak: heap,
    samples: [],
    done: false,
  }
}

function addSample(current: Run): void {
  const sorted = windowTimes.subarray(0, Math.min(current.windowFrames, windowSize)).sort()
  const heap = heapMB()
  const { world } = current
  current.heapPeak = maxHeap(current.heapPeak, heap)
  current.samples.push({
    t: round(current.totalMs / 1000, 1),
    fps: round((current.windowFrames * 1000) / current.windowMs, 1),
    p95: round(percentile(sorted, 0.95)),
    ships: aliveShips(world),
    shots: world.projectiles.length,
    fx: world.effects.length,
    heapMB: heap,
  })
  current.windowFrames = 0
  current.windowMs = 0
}

function addFrame(current: Run, dt: number): void {
  const { world } = current
  frameTimes[current.frames % historySize] = dt
  current.frames += 1
  current.totalMs += dt
  current.maxMs = Math.max(current.maxMs, dt)
  if (dt > slowFrameMs) current.over20 += 1
  if (dt > longFrameMs) current.over33 += 1
  if (current.windowFrames < windowSize) windowTimes[current.windowFrames] = dt
  current.windowFrames += 1
  current.windowMs += dt
  current.peakShips = Math.max(current.peakShips, aliveShips(world))
  current.peakShots = Math.max(current.peakShots, world.projectiles.length)
  current.peakFx = Math.max(current.peakFx, world.effects.length)
  if (current.windowMs >= 1000) addSample(current)
}

function gpuOf(app: Application): string | null {
  const { renderer } = app
  if (!('gl' in renderer)) return null
  const { gl } = renderer
  const info = gl.getExtension('WEBGL_debug_renderer_info')
  const value: unknown = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)
  return typeof value === 'string' ? value : null
}

function summaryOf(current: Run): PerfSummary {
  const sorted = frameTimes.slice(0, Math.min(current.frames, historySize)).sort()
  const durationSec = current.totalMs / 1000
  const heapEnd = heapMB()
  return {
    frames: current.frames,
    durationSec: round(durationSec),
    meanFps: round(current.frames / durationSec),
    p50Ms: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    p99Ms: round(percentile(sorted, 0.99)),
    maxMs: round(current.maxMs),
    over20Ms: current.over20,
    over33Ms: current.over33,
    peakShips: current.peakShips,
    peakShots: current.peakShots,
    peakFx: current.peakFx,
    heapStartMB: current.heapStart,
    heapEndMB: heapEnd,
    heapPeakMB: maxHeap(current.heapPeak, heapEnd),
    endReason: current.world.endReason,
  }
}

function reportOf(current: Run): PerfReport {
  const { app, world } = current
  const { sessionSeconds, spawnIntervalSec, configKey, seed, custom } = world.config
  return {
    meta: {
      userAgent: navigator.userAgent,
      devicePixelRatio: window.devicePixelRatio,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      canvas: { width: app.canvas.width, height: app.canvas.height },
      renderer: app.renderer.name,
      gpu: gpuOf(app),
      commit: import.meta.env.VITE_COMMIT_SHA ?? null,
      createdAt: new Date().toISOString(),
    },
    config: { sessionSeconds, spawnIntervalSec, configKey, seed, custom },
    summary: summaryOf(current),
    samples: current.samples,
  }
}

function download(report: PerfReport): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `pirate-battle-perf-${report.meta.createdAt.replace(/[:.]/g, '-')}.json`
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function finish(current: Run): void {
  current.done = true
  if (current.frames === 0) return
  if (current.windowFrames > 0) addSample(current)
  download(reportOf(current))
}

export const perfProbe = {
  enable(): void {
    if (enabled) return
    enabled = true
    frameTimes = new Float32Array(historySize)
    windowTimes = new Float32Array(windowSize)
  },
  frame(state: MatchState, world: World, app: Application): void {
    if (!enabled) return
    const now = frameTime()
    const current = run?.world === world ? run : startRun(world, app, now)
    const dt = now - current.last
    run = current
    current.last = now
    if (current.done) return
    if (state === 'ended') finish(current)
    else if (state === 'running' && dt > 0) addFrame(current, dt)
  },
}

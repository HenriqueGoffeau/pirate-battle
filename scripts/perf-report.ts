import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { cpus, release, totalmem, type as osType, version as osVersion } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

type Sample = { t: number; fps: number; p95: number; ships: number; shots: number; fx: number; heapMB: number | null }

type Override = Record<string, { value: number; default: number }>

type BrowserInfo = { name: string; version: string; headless: boolean }

type PerfRun = {
  meta: {
    userAgent: string
    devicePixelRatio: number
    viewport: { width: number; height: number }
    canvas: { width: number; height: number }
    renderer: string
    gpu: string | null
    commit: string | null
    createdAt: string
    browser?: BrowserInfo
    balanceOverride?: Override
    bot?: { pattern: string; autoResumes: number }
    consoleErrors?: string[]
  }
  config: { sessionSeconds: number; spawnIntervalSec: number; configKey: string; seed: number; custom: boolean }
  summary: {
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
  samples: Sample[]
}

type MemoryRow = {
  cycle: number
  heapUsedMB: number
  jsHeapUsedMB: number
  domNodes: number
  jsEventListeners: number
  documents: number
  canvases: number
}

type MemoryRun = {
  meta: {
    createdAt: string
    browser: BrowserInfo
    viewport: { width: number; height: number } | null
    options: { sessionSeconds: number; spawnIntervalSec: number }
    balanceOverride: Override
    cycles: number
    playSeconds: number
    method: string
  }
  rows: MemoryRow[]
  verdict: { rule: string; heap2MB: number; heap5MB: number; limitMB: number; pass: boolean }
}

type Chunk = { label: string; files: string[]; raw: number; gzip: number }

const perfDir = join('docs', 'perf')
const buildDir = 'dist-perf'
const targets = { meanFps: 58, p95Ms: 20 }
const windowSec = 30

function readJson<T>(path: string): T | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : null
}

function git(command: string): string | null {
  try {
    return execSync(`git ${command}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

const verdict = (pass: boolean) => (pass ? '**PASS**' : '**FAIL**')
const fixed = (value: number | null | undefined, digits = 1) => (value == null ? 'n/a' : value.toFixed(digits))
const mb = (value: number | null | undefined) => (value == null ? 'n/a' : `${value.toFixed(1)} MB`)
const kb = (bytes: number) => `${(bytes / 1000).toFixed(1)} kB`
const table = (head: string[], rows: string[][]) =>
  [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n')

function overrideText(override: Override | undefined): string {
  if (!override || Object.keys(override).length === 0) return 'none (default `GameConfig`)'
  return Object.entries(override)
    .map(([path, entry]) => `\`${path}\` = ${entry.value} (default ${entry.default})`)
    .join(', ')
}

function browserText(browser: BrowserInfo | undefined): string {
  if (!browser) return 'n/a'
  return `${browser.name} ${browser.version} (${browser.headless ? 'headless' : 'headed'}, Playwright)`
}

function setupSection(perf: PerfRun | null, memory: MemoryRun | null): string {
  const cpu = cpus()
  const rows: string[][] = [
    ['Machine', `${osVersion()} (${osType()} ${release()})`],
    ['CPU', `${cpu[0]?.model.trim() ?? 'unknown'} · ${cpu.length} logical cores`],
    ['RAM', `${(totalmem() / 1024 ** 3).toFixed(1)} GB`],
    ['Browser', browserText(perf?.meta.browser ?? memory?.meta.browser)],
  ]
  if (perf) {
    const { meta, config } = perf
    rows.push(
      ['GPU', meta.gpu ?? 'n/a'],
      ['Renderer', `Pixi ${meta.renderer}`],
      ['Viewport · DPR · canvas', `${meta.viewport.width}×${meta.viewport.height} · ${meta.devicePixelRatio} · ${meta.canvas.width}×${meta.canvas.height} px`],
      ['Build', `commit \`${meta.commit ?? git('rev-parse --short HEAD') ?? 'unknown'}\` · production bundle (\`vite build\` → \`${buildDir}\`, served by \`vite preview\`)`],
      ['Match', `\`${config.configKey}\` (${config.sessionSeconds} s, a spawn every ${config.spawnIntervalSec} s) · seed ${config.seed} · custom ${config.custom}`],
      ['Balance override', overrideText(meta.balanceOverride)],
      ['Run', meta.createdAt],
    )
  }
  if (memory) {
    rows.push([
      'Memory run',
      `${memory.meta.createdAt} · options s${memory.meta.options.sessionSeconds}-i${memory.meta.options.spawnIntervalSec} · balance override ${overrideText(memory.meta.balanceOverride)}`,
    ])
  }
  return `## Setup\n\n${table(['', ''], rows)}`
}

function methodSection(perf: PerfRun | null, memory: MemoryRun | null): string {
  const lines = [
    '## Method',
    '',
    '- `npm run perf` builds the production bundle into `dist-perf`, serves it with `vite preview` on port 4174 and runs `playwright.perf.config.ts` (Chromium, 1920×1080, DPR 1, headed by default so the real GPU is used; `PERF_HEADLESS=1` switches to headless). `npm run perf:report` re-renders this file from the JSON.',
    '- `src/session/perfProbe.ts` is enabled only by `?perf=1` (read once in `main.tsx`). Each animation frame it stores the frame interval (the rAF timestamp via `document.timeline.currentTime`) in a preallocated `Float32Array` ring buffer, only while the match is `running` (loading, paused and ended frames are skipped). Every second of play it records a sample (FPS, p95 of that second, ships alive, projectiles, effects, `performance.memory` heap). When the match ends it builds the JSON report and downloads it through a Blob link.',
    '- `scripts/perf.spec.ts` runs without `?test=1` (production mode: real clock, no hooks). It sets the options through local storage, raises the player\'s health through the dev balance so the ship survives the whole match (the run is therefore marked `custom`, which only excludes it from ranking), clicks Play and drives the ship with real key presses until the report downloads (≈ 3 min).',
  ]
  if (perf?.meta.bot) lines.push(`- Bot pattern: ${perf.meta.bot.pattern}. Auto-resumes during the run: ${perf.meta.bot.autoResumes}.`)
  if (memory) lines.push(`- \`scripts/memory.spec.ts\`: ${memory.meta.method}`)
  lines.push(`- Targets (spec §18): mean ≥ ${targets.meanFps} FPS, p95 frame time ≤ ${targets.p95Ms} ms, heap(5) ≤ heap(2) × 1.10.`)
  return lines.join('\n')
}

function windowRows(samples: Sample[]): string[][] {
  const groups = new Map<number, Sample[]>()
  for (const sample of samples) {
    const index = Math.max(0, Math.ceil(sample.t / windowSec) - 1)
    const group = groups.get(index) ?? []
    group.push(sample)
    groups.set(index, group)
  }
  return [...groups.entries()].map(([index, group]) => {
    const heap = group.at(-1)?.heapMB
    return [
      `${index * windowSec}–${(index + 1) * windowSec} s`,
      fixed(group.reduce((sum, sample) => sum + sample.fps, 0) / group.length),
      fixed(Math.max(...group.map((sample) => sample.p95)), 2),
      `${fixed(group.reduce((sum, sample) => sum + sample.ships, 0) / group.length)} / ${Math.max(...group.map((sample) => sample.ships))}`,
      String(Math.max(...group.map((sample) => sample.shots))),
      String(Math.max(...group.map((sample) => sample.fx))),
      mb(heap),
    ]
  })
}

function resultsSection(perf: PerfRun | null): string {
  if (!perf) return '## Results\n\nNo `docs/perf/perf-run.json` yet: run `npm run perf`.'
  const { summary } = perf
  const share = (count: number) =>
    summary.frames > 0 ? `${count} (${((count / summary.frames) * 100).toFixed(2)} %)` : String(count)
  const rows = [
    ['Mean FPS (frames ÷ running time)', fixed(summary.meanFps, 2), `≥ ${targets.meanFps}`, verdict(summary.meanFps >= targets.meanFps)],
    ['p95 frame time', `${fixed(summary.p95Ms, 2)} ms`, `≤ ${targets.p95Ms} ms`, verdict(summary.p95Ms <= targets.p95Ms)],
    ['p50 / p99 / max frame time', `${fixed(summary.p50Ms, 2)} / ${fixed(summary.p99Ms, 2)} / ${fixed(summary.maxMs, 2)} ms`, '', ''],
    ['Display refresh (1000 ÷ p50; rAF follows vsync)', summary.p50Ms > 0 ? `≈ ${Math.round(1000 / summary.p50Ms)} Hz` : 'n/a', '', ''],
    ['Frames > 20 ms', share(summary.over20Ms), '', ''],
    ['Frames > 33 ms', share(summary.over33Ms), '', ''],
    ['Frames · running time', `${summary.frames} · ${fixed(summary.durationSec, 1)} s`, '', ''],
    ['End', summary.endReason ?? 'n/a', '', ''],
    ['Peak ships alive / projectiles / effects', `${summary.peakShips} / ${summary.peakShots} / ${summary.peakFx}`, '', ''],
    ['JS heap start / end / peak', `${mb(summary.heapStartMB)} / ${mb(summary.heapEndMB)} / ${mb(summary.heapPeakMB)}`, '', ''],
  ]
  const errors = perf.meta.consoleErrors ?? []
  return [
    '## Results',
    '',
    table(['Metric', 'Value', 'Target', 'Verdict'], rows),
    '',
    errors.length === 0 ? 'Console errors during the run: none.' : `Console errors during the run: ${errors.length}.`,
    '',
    `### Per ${windowSec} seconds`,
    '',
    table(['Window', 'Mean FPS', 'Worst p95 (ms)', 'Ships avg / max', 'Max shots', 'Max effects', 'Heap at end'], windowRows(perf.samples)),
  ].join('\n')
}

function memorySection(memory: MemoryRun | null): string {
  if (!memory) return '## Memory\n\nNo `docs/perf/memory-run.json` yet: run `npm run perf`.'
  const rows = memory.rows.map((row) => [
    row.cycle === 0 ? '0 (menu, before playing)' : String(row.cycle),
    fixed(row.heapUsedMB, 2),
    fixed(row.jsHeapUsedMB, 2),
    String(row.domNodes),
    String(row.jsEventListeners),
    String(row.documents),
    String(row.canvases),
  ])
  const { verdict: result } = memory
  return [
    '## Memory',
    '',
    table(['Cycle', 'Heap used (MB)', 'JSHeapUsedSize (MB)', 'DOM nodes', 'JS listeners', 'Documents', 'Canvases'], rows),
    '',
    `Verdict: ${result.rule} → ${fixed(result.heap5MB, 2)} MB vs limit ${fixed(result.limitMB, 2)} MB (heap(2) = ${fixed(result.heap2MB, 2)} MB): ${verdict(result.pass)}`,
  ].join('\n')
}

const staticDir = join(buildDir, 'static')
const staticImport = /(?:from|import)\s*"\.\/([^"]+\.js)"/g
const dynamicImport = /import\(\s*[`"']\.\/([^`"']+\.js)[`"']\s*\)/g

function chunkOf(label: string, files: string[]): Chunk {
  const contents = files.map((file) => readFileSync(join(staticDir, file)))
  return {
    label,
    files,
    raw: contents.reduce((sum, content) => sum + content.length, 0),
    gzip: contents.reduce((sum, content) => sum + gzipSync(content).length, 0),
  }
}

function importsOf(file: string, pattern: RegExp): string[] {
  return [...readFileSync(join(staticDir, file), 'utf8').matchAll(pattern)].map((match) => match[1])
}

function closure(roots: string[], loaded: Set<string>): string[] {
  const found = new Set<string>()
  const queue = [...roots]
  while (queue.length > 0) {
    const file = queue.pop()
    if (!file || found.has(file) || loaded.has(file) || !existsSync(join(staticDir, file))) continue
    found.add(file)
    queue.push(...importsOf(file, staticImport))
  }
  found.forEach((file) => loaded.add(file))
  return [...found]
}

function loadingSection(): string {
  if (!existsSync(staticDir)) return `## Loading\n\nNo \`${buildDir}\` build found: run \`npm run perf\`.`
  const scripts = readdirSync(staticDir).filter((file) => file.endsWith('.js') && statSync(join(staticDir, file)).isFile())
  const html = readFileSync(join(buildDir, 'index.html'), 'utf8')
  const entry = /src="\/static\/([^"]+\.js)"/.exec(html)?.[1]
  const loaded = new Set<string>()
  const pick = (pattern: RegExp) => scripts.filter((file) => pattern.test(file))
  const entryFiles = closure(entry ? [entry] : [], loaded)
  const mswFiles = closure(pick(/^browser-/), loaded)
  const gameFiles = closure(pick(/^GameHost-/), loaded)
  const pixiFiles = closure(gameFiles.flatMap((file) => importsOf(file, dynamicImport)), loaded)
  const chunks = [
    chunkOf('Entry: `index` + static imports (React, router, TanStack Query, Axios, data layer; every screen)', entryFiles),
    chunkOf('Mocks: `browser` (MSW + fixtures; loaded at boot, before the first render)', mswFiles),
    chunkOf('Game: `GameHost` + static imports (Pixi core, render, session; downloaded on Play)', gameFiles),
    chunkOf('Pixi on demand: renderer stubs and extension chunks imported at `app.init` (only the used ones are fetched)', pixiFiles),
    chunkOf('Other: test API (`?test=1` only) and anything unreferenced', scripts.filter((file) => !loaded.has(file))),
  ]
  const rows = chunks.map((chunk) => [
    chunk.label,
    chunk.files.map((file) => `\`${file}\``).join('<br>') || '—',
    kb(chunk.raw),
    kb(chunk.gzip),
  ])
  rows.push([
    'Total JS',
    `${scripts.length} files`,
    kb(chunks.reduce((sum, chunk) => sum + chunk.raw, 0)),
    kb(chunks.reduce((sum, chunk) => sum + chunk.gzip, 0)),
  ])
  return [
    '## Loading',
    '',
    "The menu, Options and Captain's Log never download Pixi: `GameHost` sits behind `React.lazy` (spec §3). MSW's chunk loads before the first render because the mocks must be up before any query (spec §16). Sizes are from the `dist-perf` production build; gzip is computed by this script (level 6), the preview server itself does not compress.",
    '',
    table(['Group', 'Files', 'Raw', 'gzip'], rows),
  ].join('\n')
}

function observationsSection(): string {
  const notes = join(perfDir, 'notes.md')
  const body = existsSync(notes) ? readFileSync(notes, 'utf8').trim() : '_No observations yet: write `docs/perf/notes.md` and run `npm run perf:report`._'
  return `## Observations\n\n${body}`
}

const perf = readJson<PerfRun>(join(perfDir, 'perf-run.json'))
const memory = readJson<MemoryRun>(join(perfDir, 'memory-run.json'))

const report = [
  '# Performance report',
  'Generated by `scripts/perf-report.ts` (`npm run perf:report`) from `docs/perf/perf-run.json` and `docs/perf/memory-run.json`.',
  setupSection(perf, memory),
  methodSection(perf, memory),
  resultsSection(perf),
  memorySection(memory),
  loadingSection(),
  observationsSection(),
].join('\n\n')

mkdirSync(perfDir, { recursive: true })
writeFileSync(join(perfDir, 'REPORT.md'), `${report}\n`)
console.log(`Wrote ${join(perfDir, 'REPORT.md')}`)

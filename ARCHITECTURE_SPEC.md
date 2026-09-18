# Pirate Battle — Architecture Specification (handoff)

This is the consolidated, self-sufficient output of the architecture sessions. It supersedes any
conflicting detail in the design-session documents (kept outside this repository as diagrams and
rationale). The challenge brief is `PIRATE_BATTLE_DESIGN_BRIEF.md`; requirement IDs below refer to it.

Scoring: GAME 35 · ARCH 20 · UI 15 · DATA 10 · TEST 10 · MSW 5 · PERF/DOC 5. Budget: **two days, fixed**.
Core gameplay and Pixi lifecycle come first; polish is last and optional.

---

## 0. Decisions (all closed)

| Topic | Decision |
| --- | --- |
| Stack | Vite · React 19 · TypeScript strict · PixiJS v8 · TanStack Query v5 · Axios · MSW v2 · Playwright · Vitest (4 tests only) · CSS Modules · ESLint with `eslint-plugin-boundaries` · React Router (real URLs). TypeScript pinned to 6.0 because typescript-eslint does not support 7.x |
| Deploy | Self-hosted Docker image (Node build stage → nginx serving `dist` on plain HTTP `:8080`) behind the author's existing reverse proxy, which terminates TLS with a trusted certificate on a dedicated subdomain root. HTTPS is mandatory: MSW's service worker only registers in a secure context. Subdomain root means no Vite `base`, router `basename` or worker-scope changes |
| Arena | One hand-authored Tiled map, 24×14 tiles of 64 px (1536×896 logical), fully visible, letterboxed. No camera, no procedural generation |
| Spawn points | Authored in map data; runtime filter = distance to player ≥ `minPlayerDist` and no ship within 80 px |
| Options screen | Exactly two settings: session seconds (60–180, step 10, default 120), spawn interval (1–10 s, step 1, default 3). Steppers + explicit Save |
| configKey | `s{sessionSeconds}-i{spawnIntervalSec}` (e.g. `s120-i3`). Records made with a non-default balance carry `custom: true` and are excluded from ranking |
| Dev panel | Behind `?dev=1` (persisted `pb:v1:dev`). Network tab: scenario select, reset server, clear outbox, flags. Balance tab: JSON textarea editing `GameConfig`, Apply → next match, Reset |
| Player identity | Generated UUID `playerId` + editable name, default "Captain Jack", stored `pb:v1:player`, sent as `X-Player-Id` |
| Ranking rows | One row per match; all rows of the local player get the YOU badge; default view = current options |
| Tie-break | score DESC → effectiveSec ASC → playedAt ASC → matchId ASC |
| Ship colors | Player = black/skull (color index 1). Chaser = red/cross (2). Shooter = blue/horse (4) |
| Enemies | Shooter common (0.7), Chaser rare (0.3) but high impact damage. First two spawns forced one of each. Cap 12 alive |
| Shooter weapon | Cannons are an array per ship kind, each with its own cooldown. Ships with `[front]`; sides are two appended config entries (stretch #1). Must be aligned within `aimTolerance` and have line of sight |
| Fire behavior | Hold to fire at cooldown rate (level-triggered). Cooldown sweep on fire buttons via one CSS animation per shot |
| Ship contact | Chaser↔player: damage + chaser self-destructs (no score). Shooter↔player: push apart, no damage; Shooter AI keeps a standoff distance. Enemy↔enemy: no collision, separation force. No friendly fire |
| Health | 100, no regeneration, no pickups |
| Pause | Manual (P/Esc) + auto on blur / hidden / portrait. Resume by button (no countdown unless stretch). Input cleared on pause/blur/resume/dispose |
| Pause → Options | Does not exist. Pause dialog = Resume / Main Menu |
| Mobile | Landscape only; portrait shows a rotate overlay and auto-pauses |
| Routing | Real URLs `/`, `/options`, `/play`, `/result`, `/log`. Reload on `/play` → menu (match abandoned, never recorded). Reload on `/result` → last result from local storage |
| Audio | Out of scope |
| Pending display | Result screen status row + menu badge. History shows confirmed rows only |
| Dates | `08 SEP · 21:42`, local time, en-GB month abbreviations |
| Page size | 5; history newest first |
| Bindings | W/↑ forward · A/D or ←/→ turn · Space fire front · Q/E broadside left/right · P/Esc pause. `event.code` based. No remapping |
| Loop | Fixed 60 Hz step with accumulator, **no render interpolation**; own rAF loop via injectable `Clock`; Pixi ticker off (`autoStart: false`, manual `app.render()`) |
| Hulls | Two circles per ship (centers ±22 px along heading, r 26); projectiles swept as segments |
| Avoidance | Feelers + separation + stuck rule; flow field is a written contingency only |
| Test hooks | `window.__PB_TEST__` in every build, gated by `?test=1` |
| Estimate to state | "Two days (≈ 28 h): day 1 playable core + Pixi lifecycle on the public URL; day 2 screens, ranking/history with mocks, Playwright, profiling, docs" |

---

## 1. Layers and dependency rules (ARCH-02)

```
app        bootstrap only: start MSW → flush outbox → mount router. Imports anything. Nothing imports app.
ui         React screens, dialogs, HUD overlay, touch buttons. Imports: session (store + handle), data, config, shared.
session    GameSession: loop, clock, lifecycle, store, dispose. Imports: sim, render, input, assets, config, shared.
sim        Pure TS rules. Imports: config, shared ONLY. Never pixi.js, react, window, document.
render     Pixi views reading sim state. Imports: sim (read), assets, shared.
input      Keyboard + pointer → InputState → Intents. Imports: shared.
assets     Pixi Assets manifest, load-once cache, map loader. Imports: shared.
data       Contracts, Axios, TanStack Query hooks, outbox, local storage. Imports: config, shared. Never sim/render/session.
mocks      MSW handlers, fixtures, scenarios, fakeDb. Imports: data/contracts, config, shared. Imported only by app.
testing    window.__PB_TEST__. Imports: session, data, mocks, shared. Imported only by app.
config     GameConfig, UserOptions, MatchConfig, configKey.
shared     Clock, seeded RNG, uuid, storage codec, math.
```

Enforce with `eslint-plugin-boundaries` (or `no-restricted-imports` per folder). Additionally ban `pixi.js`
and DOM globals inside `src/sim/**`.

Hidden couplings to avoid: touch buttons (ui) never import `input`; they call `handle.input.setAction()`.
UI never calls the sim; it calls `handle.pause()/resume()`.

## 2. Folder structure

```
src/
  app/        main.tsx (startMsw → flushOutbox → render), router.tsx, providers.tsx
  config/     gameConfig.ts, userOptions.ts (limits, validate), matchConfig.ts (snapshot, configKey, custom)
  shared/     clock.ts (Clock, RealClock, ManualClock), rng.ts (mulberry32), storage.ts, uuid.ts, math.ts
  sim/        world.ts, entities.ts, map.ts (MapData, MapSource), step.ts, snapshot.ts,
              systems/ (ai, movement, weapons, projectiles, collision, damage, spawn, cleanup, effects, endCheck)
  render/     stage.ts, views/ (ShipView, ProjectileView, HealthBarView), effects.ts, viewport.ts
  input/      bindings.ts, inputState.ts, keyboard.ts, pointer.ts
  assets/     manifest.ts, loader.ts (ensureLoaded), tiledMap.ts (MapSource impl)
  session/    GameSession.ts, loop.ts, lifecycle.ts, store.ts, perfProbe.ts
  data/       contracts/, http.ts, api.ts, queries.ts, outbox.ts, local.ts
  mocks/      handlers.ts, fixtures.ts, scenarios.ts, fakeDb.ts, browser.ts
  testing/    testApi.ts
  ui/         screens/ (Menu, Options, Play, Result, CaptainsLog), game/ (GameHost, Hud, TouchControls, PauseDialog),
              components/ (WoodPanel, GoldButton, RoundButton, Tabs), a11y/ (LiveRegion), dev/ (DevPanel)
public/       mockServiceWorker.js, assets/ (converted atlases, tiles, ui), maps/archipelago-1.json
scripts/      convert-atlases.ts (Sparrow XML → Pixi JSON; tile grid → JSON), perf.spec.ts, memory.spec.ts
e2e/          fixtures/pbPage.ts, specs/test-01..12.spec.ts, __screenshots__/
docs/         ARCHITECTURE.md, README sections, licenses.md, perf/REPORT.md, reports/
Dockerfile    multi-stage: node:24-alpine build (VITE_COMMIT_SHA build arg) → nginx:alpine serving dist on :8080, healthcheck
nginx.conf    SPA fallback for extensionless paths only; cache rules per path (see §16)
docker-compose.yml  one service, restart unless-stopped; .dockerignore keeps the build context small
```

Vite `build.assetsDir` is `static`, so hashed bundles (`/static/*`, cached immutable) never share a folder with the
unhashed files copied from `public/assets/` (`/assets/*`, revalidated).

## 3. React ↔ PixiJS bridge (ARCH-01/04/08/09)

- `GameHost` (React) creates a `GameSession` in `useEffect([matchConfig])`, calls `start()`, returns `() => dispose()`.
  `matchConfig` must be a stable snapshot object created on navigation to `/play`; Play Again creates a new one.
- `GameSession.start()`:
  1. `await assets.ensureLoaded(p => publish({loadProgress: p}))`
  2. `const app = new Application(); await app.init({ resolution: dpr, autoDensity: true, autoStart: false })`
  3. `if (this.disposed) { app.destroy(true); return }` ← Strict Mode guard after **every** await
  4. append canvas, build stage, attach input, start loop, `publish({ matchState: 'ready' })`
- `dispose()` is idempotent: flag → stop loop → detach input + blur/visibility/orientation listeners → disconnect ResizeObserver
  → drop store subscribers → `stage.destroy({children:true, texture:false})` → `app.destroy(true, {children:true, texture:false})`
  → null out world/render/app. Textures live in `Assets` for the app lifetime.
- One Pixi `Application` per match.
- Store: `SessionStore { getSnapshot(): HudSnapshot; subscribe(cb) }` consumed with `useSyncExternalStore`; published after each frame
  only when a field changed (`Object.is` per key). Edge events (`weaponFired{side, cooldownMs}`, `playerHit`, `enemyDestroyed`) via `handle.on()`, no state.

```ts
type HudSnapshot = {
  matchState: 'loading'|'assetError'|'ready'|'running'|'paused'|'resuming'|'ended'
  endReason?: 'timeUp'|'defeated'
  score: number; timeLeftSec: number   // ceil(remainingMs/1000)
  health: number; maxHealth: number
  loadProgress: number                 // 0..1
}
interface SessionHandle {
  store: SessionStore
  on(event: string, cb: (payload: unknown) => void): () => void
  input: { setAction(a: Action, down: boolean): void }
  pause(): void; resume(): void
  getResult(): MatchResult | null      // once, after 'ended'
  dispose(): Promise<void>
}
```

Who draws what: Pixi = tiles, ships, shots, effects, over-ship health bars. React = HUD (health/score/time),
touch buttons, pause button, dialogs, live region. Cooldown sweep = CSS animation started by `weaponFired`.

## 4. Simulation loop and time (ARCH-03, MR-09/10)

```ts
interface Clock { now(): number; onFrame(cb: (t: number) => void): () => void }
// RealClock = performance.now + requestAnimationFrame. ManualClock.advance(ms) fires cb once per 16.667 ms.

const STEP = 1000/60, MAX_FRAME = 250
frame(t):
  frameDt = min(t - last, MAX_FRAME); last = t
  if (state !== 'running') { render.draw(world); return }
  acc += frameDt
  while (acc >= STEP) {
    intents = input.sample()
    step(world, STEP/1000, intents)
    acc -= STEP
    if (world.ended) { lifecycle.end(world.endReason); break }
  }
  render.draw(world)
  store.publishIfChanged(buildHud(world))

step(w, dt, intents):            // order is the rulebook
  1  w.time += dt                 // match timer
  2  aiSystem                     // enemy intents
  3  movementSystem               // rotate, thrust, arena clamp, island slide (both factions)
  4  weaponSystem                 // per-cannon cooldowns, spawn projectiles
  5  projectileSystem             // swept move, range/lifetime
  6  collisionSystem              // shot↔ship, chaser↔player, shot↔island → hits queue, consumed flag
  7  damageSystem                 // apply once, mark dead, score (killedBy)
  8  spawnSystem                  // interval timer, authored points
  9  cleanupSystem                // remove dead/consumed → pools
  10 effectSystem                 // explosion/flash lifetimes
  11 endCheck                     // hp ≤ 0 → defeated (wins ties); time ≤ 0 → timeUp
```

Rules: sim time advances only inside `step`; no `setTimeout` in sim; all timers (cooldowns, spawn, lifetimes) are
`w.time`-relative. Pause zeroes the accumulator on resume. `world.rng` (seeded) is used only by sim systems;
render uses a separate RNG. Entity model: plain data arrays (`ships[]`, `projectiles[]`, `effects[]`) + system functions;
projectiles and effects pooled; stable incrementing ids.

## 5. Configuration (CFG-01..05)

```ts
export const GameConfig = Object.freeze({
  arena:   { cols: 24, rows: 14, tile: 64, mapId: 'archipelago-1' },
  player:  { maxHealth: 100, speed: 120, turnRate: 2.4, radius: 26, colorIndex: 1,
             cannons: [
               { id: 'front', group: 'front', angle: 0,      offset: 0,   damage: 20, speed: 420, range: 520, cooldown: 0.6 },
               { id: 'l1', group: 'left',  angle: -90, offset: -22, damage: 12, speed: 380, range: 420, cooldown: 1.4 },
               { id: 'l2', group: 'left',  angle: -90, offset: 0,   damage: 12, speed: 380, range: 420, cooldown: 1.4 },
               { id: 'l3', group: 'left',  angle: -90, offset: 22,  damage: 12, speed: 380, range: 420, cooldown: 1.4 },
               { id: 'r1', group: 'right', angle: 90,  offset: -22, damage: 12, speed: 380, range: 420, cooldown: 1.4 },
               { id: 'r2', group: 'right', angle: 90,  offset: 0,   damage: 12, speed: 380, range: 420, cooldown: 1.4 },
               { id: 'r3', group: 'right', angle: 90,  offset: 22,  damage: 12, speed: 380, range: 420, cooldown: 1.4 },
             ] },
  enemies: {
    chaser:  { maxHealth: 40, speed: 165, turnRate: 3.0, radius: 26, impactDamage: 35, colorIndex: 2, cannons: [] },
    shooter: { maxHealth: 60, speed: 110, turnRate: 2.0, radius: 26, colorIndex: 4,
               attackRange: 380, minRange: 220, aimTolerance: 0.26,
               cannons: [ { id: 'front', group: 'front', angle: 0, offset: 0, damage: 10, speed: 360, range: 440, cooldown: 2.2 } ] },
               // stretch: append { angle: -90 } and { angle: 90 } entries for side cannons
  },
  spawn:   { weights: { shooter: 0.7, chaser: 0.3 }, forceBothWithin: 2, maxAlive: 12, minPlayerDist: 320, occupancyRadius: 80 },
  projectile: { radius: 5, maxLifetime: 3 },
  damageStages: [1, 0.66, 0.33, 0],   // health fraction thresholds → sprite stage 0..3
})
export const OptionLimits = {
  sessionSeconds:   { min: 60, max: 180, step: 10, default: 120 },
  spawnIntervalSec: { min: 1,  max: 10,  step: 1,  default: 3 },
}
export type UserOptions = { sessionSeconds: number; spawnIntervalSec: number }
export type MatchConfig = typeof GameConfig & UserOptions & { configKey: string; custom: boolean; seed: number }
export const configKey = (o: UserOptions) => `s${o.sessionSeconds}-i${o.spawnIntervalSec}`
// custom = !deepEqual(balancePart(matchConfig), GameConfig)
```

Units: px/s, rad/s, seconds; logical pixels of the 1536×896 world. Balance numbers are placeholders; tune once in M2's last 30 min.
Ship sprites: file `ship_{n}` with `stage = floor((n-1)/6)`, `color = (n-1)%6`; bow faces +Y in the source, so rotate by −90° (or +90°, verify) relative to heading.

## 6. Map data (D-A/B/C)

```ts
export type MapData = {
  id: string; cols: number; rows: number; tile: number
  tiles: number[]                 // row-major tile ids for render
  solid: Uint8Array               // 1 = blocks ships and shots
  playerStart: { x: number; y: number; heading: number }
  spawnPoints: Array<{ x: number; y: number; heading: number; kinds: Array<'chaser'|'shooter'> }>
}
export interface MapSource { load(id: string): Promise<MapData> }
```

Authoring in Tiled: tileset `tiles_sheet.png` at 64 px, 16 columns. **First: paint a 4×4 probe and verify tile index → (col,row)
is row-major from top-left.** Layers: `ground` (tiles), `solid` (tile layer or tile property `solid=true`), object layer `spawns`
(rotation → heading, `type` → kinds), object `player`. 3 roughly convex islands, none touching the rim, ≥ 3 tiles of water between
land masses and between land and the arena edge. 10 spawn points around the rim ≥ 1.5 tiles from edge and ≥ 2 tiles from land;
the two nearest the player start allow Shooter only. Export JSON to `public/maps/archipelago-1.json`; `assets/tiledMap.ts` converts to `MapData`.
Static tile layer rendered once into a cached container. Vitest: every spawn point is on water with a clear ring and reaches
the player start through water (BFS in the test only).

## 7. Collisions (CB-01..06)

| Pair | Test | Response |
| --- | --- | --- |
| Ship ↔ island | each hull circle vs solid tiles in its 3×3 neighbourhood (circle↔AABB), two passes | push out along min-penetration axis, keep tangential velocity (slide) |
| Ship ↔ arena edge | center vs bounds − r | clamp |
| Shot ↔ island | DDA walk of the tile grid along this tick's segment | consume at first solid tile, splash effect |
| Shot ↔ ship | swept segment vs each hull circle (r + 5), opposing faction only | earliest hit wins; consume; push `{targetId, amount, sourceId}` to hits |
| Chaser ↔ player | any hull circle pair | player −impactDamage; chaser dead with `killedBy: 'self'` (no score), explosion |
| Shooter ↔ player | hull circles | push both apart half-way, no damage |
| Enemy ↔ enemy | none | separation force in AI |

No broad phase (≤ 13 ships × ~40 shots). Damage applied only in `damageSystem` from the hits queue; a projectile marked
`consumed` in step 6 cannot hit again (CB-04). Dead ships flagged in 7, removed in 9 (CB-06).

## 8. Enemy AI and spawning (EN-01..06)

```
steerTo(ship, dir, dt): err = wrapAngle(atan2(dir) - heading); turn = clamp(err/(turnRate*dt), -1, 1); thrust = |err| < 90° ? 1 : 0.3
desired(enemy) = normalize(toPlayer*1.0 + separation*0.6 + feeler*1.2)
  separation = Σ (pos - other.pos)/d² for enemies within 70 px
  feeler     = 48 px ray ahead vs solid mask → lateral nudge when blocked
  stuck rule = blocked > 1 s → commit to one turn direction for 1.5 s
CHASER : steerTo(desired), full thrust; contact handled by collision
SHOOTER: d = dist(player)
  d > attackRange → steerTo(desired)
  d < minRange    → steerTo(-toPlayer + separation + feeler)          // back off
  else            → steerTo(perp(toPlayer)*orbitSign + feeler*1.2)     // orbit; orbitSign flips when blocked > 0.5 s
  for each cannon: if |wrapAngle(cannonDir - angleTo(player))| < aimTolerance and cooldown ready and lineOfSight → fire
lineOfSight reuses the shot↔island DDA.
```

Spawning: `nextSpawnAt += spawnIntervalSec` in sim time (timer keeps advancing even when a spawn is skipped).
Skip when `alive ≥ maxAlive` or no candidate passes the filter (distance ≥ minPlayerDist, no ship within occupancyRadius).
Type: seeded weighted pick; first two spawns forced one of each in seeded order. New enemies face the player.
Enemies use the same `movementSystem` as the player; AI writes intents only.

## 9. Match lifecycle (MR-*, CFG-06)

States: `loading → assetError ⇄ (Retry) → ready → running ⇄ paused → resuming → running → ended{timeUp|defeated} → disposed`.
- Only `running` steps the sim; others repaint.
- Pause triggers: P/Esc, `blur`, `visibilitychange`, `(orientation: portrait)`. Listeners attached only in `running`/`resuming`.
- Resume = button click → `resuming` (one frame without countdown) → `input.clear()` → `running`.
- `ended` entered from `endCheck`; `getResult()` returns `{ score, effectiveSec: floor(w.time), endReason, matchConfig, seed }` once.
- Main Menu / route change / reload during any state → dispose, nothing recorded.
- Play Again → new `MatchConfig` snapshot + new seed → new session.

## 10. Assets (ARCH-05, A11Y-04)

- Build script converts `ships_miscellaneous_sheet.xml` (Sparrow) → Pixi JSON, and the 16×6 tile grid → Pixi JSON (1× and 2×).
- Manifest bundle `combat`: `ships` (1× only — retina copies are not 2×), `tiles`/`ui` chosen 1× or 2× once at boot by `devicePixelRatio > 1.5`.
- `ensureLoaded(onProgress)` memoises the promise at module level; on failure the memo is cleared so Retry works.
  Called inside `GameSession.start()` before `app.init()`; second match hits `ready` instantly.
- Texture index `textures.ship[stage][color]` built once. `ShipView` swaps texture when `damageStage(health/max)` changes (FX-03).
- Effects: explosion sprites scaled/faded in code (FX-02); muzzle flash = small explosion sprite 120 ms (FX-01); hit flash tint on the ship (FX-04).
- Tests simulate failure via Playwright `page.route('**/ships.json', route => route.abort())`.
- Licenses: `docs/licenses.md` (Kenney Pirate Pack CC0 — verify; UI pack from the challenge; no audio shipped).

## 11. Viewport (ARCH-06, A11Y-02/03)

`scale = min(W/1536, H/896)`; world container centered; letterbox bars navy. `ResizeObserver` on the host drives
`renderer.resize(W, H)`; `resolution: devicePixelRatio, autoDensity: true`. HUD and touch layer are DOM, positioned against the
viewport with `env(safe-area-inset-*)`; buttons ≥ 56 px. Minimum tested phone 640×360. Visual regression viewports: 1280×720 and
915×412 (landscape mobile), DPR 1.

## 12. Input (GP-06/07/08, A11Y-07, MR-10)

```ts
type Action = 'forward'|'turnLeft'|'turnRight'|'fireFront'|'fireLeft'|'fireRight'|'pause'
bindings: KeyW/ArrowUp forward · KeyA/ArrowLeft turnLeft · KeyD/ArrowRight turnRight · Space fireFront · KeyQ fireLeft · KeyE fireRight · KeyP/Escape pause
InputState: held: Set<Action>; setAction(a, down); onKey(e) { if (!bindings[e.code]) return; e.preventDefault(); if (e.repeat) return; ... }
sample(): Intents = { thrust: 0|1, turn: -1|0|1, fire: { front, left, right } }   // sampled once per tick
clear(): on pause, blur, hidden, resume, dispose
```

Keyboard listeners on `window` only while `running`/`resuming`. Touch layer: six `<button>`s with pointer events, `setPointerCapture`,
`pointercancel`/`lostpointercapture` release, `touch-action: none`. Menu renders the controls table from `bindings`.

## 13. Data contracts and API (API-*)

```ts
type EndReason = 'timeUp' | 'defeated'
type MatchRecord = { matchId: string; playerId: string; playerName: string; playedAt: string; score: number;
  effectiveSec: number; endReason: EndReason; configKey: string; custom: boolean; config: MatchConfig }
type RankingEntry = { rank: number; matchId: string; playerId: string; playerName: string; score: number;
  effectiveSec: number; playedAt: string; isYou: boolean }
type Page<T> = { items: T[]; page: number; pageSize: number; totalItems: number; totalPages: number; serverTime: string }
type ConfigSummary = { configKey: string; sessionSeconds: number; spawnIntervalSec: number; matches: number }
type ApiError = { status: number; code: 'not_found'|'validation'|'conflict'|'server'|'network'|'timeout'; message: string; retryable: boolean }

GET /api/ranking?configKey=&page=&pageSize=5          → Page<RankingEntry>   (excludes custom records)
GET /api/ranking/configs                              → ConfigSummary[]      (contract only; UI selector is stretch)
GET /api/players/:playerId/matches?page=&pageSize=5   → Page<MatchRecord>    newest first
PUT /api/matches/:matchId  body MatchRecord           → 201 created | 200 existing | 422 invalid
Header X-Player-Id on every request. Axios timeout 8 s; pass the query AbortSignal. Interceptor normalises to ApiError;
retryable = network | timeout | 5xx | 429.
```

Comparator (shared by handler and tests): score DESC → effectiveSec ASC → playedAt ASC → matchId ASC.
Handler recomputes `configKey` from `config` and rejects mismatch with 422.

## 14. Queries and outbox (API-06..14)

```ts
keys.ranking(configKey, page) = ['ranking', configKey, page]
keys.history(playerId, page)  = ['history', playerId, page]
useRanking/useHistory: queryFn({signal}) → api.get(..., signal); placeholderData: keepPreviousData; staleTime 15 s;
  retry: (n, e) => e.retryable && n < 2; retryDelay: min(1000·2^n, 8000); refetchOnMount: 'always'; refetchOnWindowFocus: true
useSaveMatch: mutationFn = api.putMatch; retry 0; onSuccess → invalidateQueries(['ranking']) and (['history'])
QueryClient: gcTime 5 min, networkMode 'always'
```

Outbox (`pb:v1:outbox`): states `pending → submitting → confirmed | failed`. Match end: build record → append to outbox and
write `pb:v1:lastResult = { record, status: 'pending' }` synchronously → navigate `/result` → dispose session. Flusher walks
pending items oldest-first through the mutation; triggers: boot, `online`, Result Retry, backoff timer 2·2ⁿ s capped 30 s.
In-memory in-flight flag per item (no cross-tab lease). 200 and 201 both confirm. 422 → permanent `failed`, kept, no auto-retry.
Result status row: saving… / saved / pending (retry in N s + Retry) / failed (message). Menu badge = pending count.
Stale responses: AbortSignal + per-page query keys are the only guard (Session 5, option a).

Panel states: pending (5 skeleton rows), fetching with data ("REFRESHING…" caption), placeholder (dimmed, pagination disabled),
empty ("No battles logged yet for this configuration." + Play), error without data (message + Retry, role=alert),
error with data (rows stay, "COULDN'T REFRESH · RETRY").

## 15. Local persistence (versioned, validated, safe fallback)

`pb:v1:options` · `pb:v1:player` · `pb:v1:lastResult` · `pb:v1:outbox` · `pb:v1:mockDb` (fake server, capped 500 records) ·
`pb:v1:scenario` · `pb:v1:dev` · `pb:v1:devBalance`. Outbox and mockDb are separate on purpose.

## 16. MSW (MSW-01..07)

Handlers are scenario-agnostic and read a `ScenarioContext` (latency fn, fail fn, saveBehaviour). Registry:

```
success · empty · manyPages (3 + 2 pages) · slow (2500 ms) · jitter (seeded 100–2000 ms) · outOfOrder (odd requests 3000 ms, even 300 ms)
timeout (12000 ms > 8 s client) · networkError · http4xx (422) · http5xx (503) · rankingFails · historyFails
timeoutAfterSave (PUT commits to fakeDb, then hangs 12 s) · downThenRecover (PUT fails until the 3rd attempt; GETs work)
```

Selection: `?scenario=id` (persisted), `?reset=1`, dev panel, `__PB_TEST__.setScenario`. Reset restores fixtures and zeroes
the per-scenario request counter. Fixtures: 24 seeded captains, scores 8–41, across 2 configKeys; local player never in fixtures.
Production: `worker.start({ onUnhandledRequest: 'bypass' })` awaited before first render, wrapped in try/catch → "offline mode" banner
on failure; `public/mockServiceWorker.js`. Hosting (nginx): extensionless paths `try_files $uri /index.html`; any path with a
file extension is `try_files $uri =404`, so a missing asset is a real 404 and never an HTML page; `/static/*` gets
`Cache-Control: public, max-age=31536000, immutable`; everything else, including `index.html` and `mockServiceWorker.js`, gets
`Cache-Control: no-cache` so a redeploy is never hidden behind a stale worker. The reverse proxy in front must pass these headers
through unchanged and add no SPA handling of its own. The page must be served over HTTPS with a trusted certificate
(service workers require a secure context); plain-HTTP LAN access is not a valid deploy.

## 17. Testing (TEST-01..18)

```ts
interface PbTestApi {            // window.__PB_TEST__, only when location.search has test=1
  setSeed(seed: number): void; useManualClock(): void; advance(ms: number): void; step(ticks: number): void
  getSnapshot(): TestSnapshot; getMatchState(): MatchState; waitForState(s: MatchState, timeoutMs?: number): Promise<void>
  setScenario(id: ScenarioId): void; resetServer(): void; getRequestLog(): ReqLog[]; clearLocal(): void
}
// Deliberately NOT exposed: setHealth, killEnemy, addScore, spawnAt (TEST-16).
```

Playwright projects: `desktop` Chromium 1280×720 DPR 1; `mobile` Chromium landscape 915×412 hasTouch (runs TEST-01 and TEST-09 only;
stretch adds 08, 10). One spec file per TEST-ID, 1–3 tests each (~22 total). Fixture `pbPage` opens
`/?test=1&scenario=X&reset=1`, waits for `body[data-msw-ready]`, fails on console errors. `?test=1` also disables ambient
animation and the render RNG. Visual baselines: menu, arena after `advance(5000)` seed 42 no input, result after timeUp;
`maxDiffPixelRatio 0.005`; generated in the Playwright Docker image. `page.clock` for wall-clock waits (outbox backoff) in data specs only.
Reporter html + list, `trace: 'retain-on-failure'`. Vitest (4 tests): comparator, validateOptions, outbox reducer, segment-circle.

Per-spec map (hooks · scenario · seed): the D9 table of design session 6 (Quality), kept outside this repository; it is
inlined here in M6.

## 18. Performance (PERF-01..04)

`session/perfProbe.ts` enabled by `?perf=1`: per-frame dt ring buffer; per-second samples {fps, p95, ships, shots, fx, heapMB};
on end downloads JSON. `scripts/perf.spec.ts`: `vite preview`, session 180 s, spawn 1 s, bot on real keyboard, 3 min real time →
`docs/perf/REPORT.md` with machine, browser, DPR, viewport, config. Targets: mean ≥ 58 FPS, p95 ≤ 20 ms. Memory: 5 × (Play → 20 s → Menu)
with manual DevTools heap snapshots (automated CDP spec is stretch); pass = heap(cycle 5) ≤ heap(cycle 2) × 1.10.

## 19. Accessibility (A11Y-05/06)

Canvas `role="img" aria-label="Battle arena"`. HUD: `<output aria-label="Score">`, `<time>`, health `role="meter"`.
One `aria-live="polite"` region: score change, time at 60/30/10 s, health crossing 50/25 %, paused/resumed/ended; ≥ 1 s apart.
Dialogs = native `<dialog>` + `showModal()`; `cancel` event → resume; focus returns to opener. Real `<button>`s with sprite
backgrounds; `:focus-visible` 3 px cream outline offset 3 px. Options: `role="group"`, `<output>` value, visible limits text,
errors `role="alert"` + `aria-describedby`. Tables: `<th scope>`, YOU row `aria-current`. `prefers-reduced-motion` disables HUD flash.
Contrast: cream #F3E9D2 on navy #243447 ≈ 10.5:1; dark #1F2A38 on gold #E0B95A ≈ 7.9:1; DEFEATED tint #F08A7A.

## 20. Milestones (two days, 24 h committed + 4 h buffer)

| # | Hours | Scope | Done when |
| --- | --- | --- | --- |
| M0 | 1.5 | Vite/React/TS strict, layer folders + lint boundaries, Playwright/Vitest installed, MSW worker file, Dockerfile + nginx.conf + compose | Local Docker image verified on `localhost:8080`: extensionless paths fall back to the app, `/result` reload works, `mockServiceWorker.js` returns 200 as JavaScript with `no-cache`, a missing asset is a 404, `/static/*` is immutable, `body[data-msw-ready]` set, console clean. Public deploy is deferred to CP1 |
| M1 | 4 | Atlas conversion, tile probe, Tiled map + loader, ensureLoaded with progress/error, GameSession skeleton (Strict-Mode-safe), static tiles, one ship, letterbox/DPR | Arena renders on desktop + phone; mount/unmount/mount leaves one canvas, zero listeners |
| M2 | 4.5 | GameConfig, world/step, movement + islands + bounds, cannons array with cooldowns, swept shots, damage/scoring, authored spawns, Chaser/Shooter AI, keyboard, over-ship bars, damage stages, explosion + wreck | Full keyboard match playable; seeded run repeats under ManualClock |
| M3 | 2 | Loop, Clock, lifecycle, pause/auto-pause/resume, store + HUD, Pause dialog, minimal Result, abandon on route change | HUD updates on change only; blur pauses; held keys don't leak; Play Again resets |
| CP1 | h14 | Day-1 buffer (2 h) → M2 overrun first, else stretch #1–2. Public deploy: homelab clone, `docker compose up -d --build`, Caddy site `reverse_proxy` to the container on the subdomain | M0–M3 deployed over HTTPS on the subdomain: `mockServiceWorker.js` 200 as JavaScript with `no-cache`; `/result` loads directly and on reload; `document.body.dataset.mswReady === "true"`; footer SHA = `git rev-parse --short HEAD` |
| M4 | 3.5 | Wood/gold primitives, Menu (controls table), Options (steppers, validate, Save), Captain's Log shell (6 states), Result status row, touch layer + sweep, portrait overlay, loading/error screens, dialogs, live region, focus | All screens usable by keyboard and touch; no clipping at 640×360 |
| M5 | 3 | Contracts, Axios, queries, outbox, storage codec, handlers, fakeDb, comparator, 14 scenarios, fixtures, dev panel (network + JSON balance), worker before render, custom flag | Deployed: match → rows in both tabs; timeoutAfterSave → one row after Retry; pending badge survives reload |
| CP2 | h20.5 | If behind: M6 keeps 3.5 h, M7 shrinks to 1.5 h | Manual pass of every TEST-ID on the deployed build |
| M6 | 3.5 | Test API, pbPage fixture, 12 spec files (order 01,03,04,06,07 → 02,05,08,09 → 10,11,12), 6 baselines, report + traces committed | `test:e2e` green twice locally, once in CI |
| M7 | 2 | Perf run, memory check, REPORT.md, README, ARCHITECTURE.md (outline §21), licenses, tagged deploy | Clean clone runs dev/build/preview/lint/typecheck/test:e2e; deployed SHA = tag |

Stretch order (buffer only): 1 Shooter side cannons (0.75 h) · 2 balance tuning (0.5) · 3 restore two-circle hulls if dropped ·
4 mobile project → TEST-01/08/09/10 (0.75) · 5 resume countdown (0.5) · 6 sinking debris/crew (0.75) · 7 automated memory spec (0.5) ·
8 balance tab as fields, config selector UI, Vitest depth, interpolation, audio (will not happen).

Working rules: commit at milestone boundaries; tune balance once (end of M2); bugs outside graded flows go to README limitations;
console clean at each checkpoint; evidence produced from the deployed URL.

## 21. ARCHITECTURE.md outline (DEL-04)

1 Overview and stack · 2 Layers and dependency rules · 3 React ↔ PixiJS integration · 4 Simulation loop and time · 5 Entities and collisions ·
6 Enemy behaviour and spawning · 7 Arena and map data · 8 Configuration (configKey, custom) · 9 Assets and resource lifecycle · 10 Input ·
11 Match lifecycle · 12 Local persistence · 13 Ranking and history (contracts, tie-break, PUT idempotency, outbox, cache, AbortSignal) ·
14 MSW · 15 Testing and determinism · 16 Performance (link REPORT.md) · 17 Accessibility · 18 Balancing decisions ·
19 Limitations and future work (no interpolation, feelers not flow field, single-tab outbox, no audio, procedural maps via MapSource, configs endpoint unused) ·
Appendix: requirement ID → section index.

README.md (DEL-03): live URL + estimate + cuts; setup and scripts (dev, build, preview, lint, typecheck, test, test:e2e, perf);
deploy (`VITE_COMMIT_SHA=$(git rev-parse --short HEAD) docker compose up -d --build`, reverse-proxy requirements from §16);
env vars (`VITE_COMMIT_SHA` build arg only); controls; gameplay config + dev panel + custom rule; scenarios and how to reproduce each; tests and baseline update
(Docker command); performance; assets and licenses.

## 22. Risk register (top items)

| Risk | Mitigation | Fallback |
| --- | --- | --- |
| Async `app.init` under Strict Mode | `disposed` guard after every await; idempotent dispose; checked at M1 exit | module-level Application per host element |
| MSW in production (worker path / rewrite / secure context) | deploy in M0; nginx fallback only for extensionless paths; HTTPS with a trusted certificate; worker `no-cache`; start() in try/catch | offline-mode banner, tabs in error state, game unaffected |
| Homelab unreachable during evaluation (DEL-02) | `restart: unless-stopped` + healthcheck; commit SHA in the menu footer; README states the self-hosted choice and the `docker compose` command | static mirror of the same `dist/` on Cloudflare Pages (≈ 10 min, M7) |
| Enemies stuck on islands | convex islands, ≥ 3-tile lanes, stuck rule, separation | flow field BFS (1.5 h) |
| Flaky visual baselines | Docker image, self-hosted font, fonts.ready, ambient off, seed 42 | mask arena; maxDiffPixelRatio 0.02 |
| Tile index assumption | 15-min probe first | fix conversion formula |
| M2 overrun | D5 order, tiny Vitest per system, CP1 gate | day-1 buffer; Shooter stays front-only |
| iOS touch quirks | pointer capture, touch-action none, 100dvh, portrait overlay | document Chromium-mobile as tested target |
| Late responses leak | signal is a required param of every api fn; TEST-12 | serverTime compare in structuralSharing |
| Service worker timing in tests | render after worker.start(); fixture waits for data-msw-ready | page.route holds /api/** until ready |
| Sticky keys | clear() on pause/blur/hidden/resume/dispose; TEST-07 | clear on unknown keyup |
| < 60 FPS at DPR 2 | static tiles, atlases, pools, cap 12 | resolution min(dpr, 2); bars redraw on change; document |

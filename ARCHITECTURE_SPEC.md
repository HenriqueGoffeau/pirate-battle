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
| Stack | Vite · React 19 · TypeScript strict · PixiJS v8 · TanStack Query v5 · Axios · MSW v2 · Playwright · Vitest (6 small suites, listed in §17) · CSS Modules · ESLint with `eslint-plugin-boundaries` · React Router (real URLs). TypeScript pinned to 6.0 because typescript-eslint does not support 7.x |
| Deploy | Self-hosted Docker image (Node build stage → nginx serving `dist` on plain HTTP `:8080`) behind the author's existing reverse proxy, which terminates TLS with a trusted certificate on a dedicated subdomain root. HTTPS is mandatory: MSW's service worker only registers in a secure context. Subdomain root means no Vite `base`, router `basename` or worker-scope changes |
| Arena | One hand-authored map, 24×14 tiles of 64 px (1536×896 logical), always fully visible at the same scale rule on every device (fair ranking). **No letterbox bars**: the sea continues past the arena on any screen shape and thickens into dense fog. No camera, no cropping, no procedural generation |
| Spawn points | **Entry points on the arena border**, authored in map data. Enemies are created just outside the rim, hidden, and **sail in through the fog** in an `arriving` state (straight in, can't fire, can't be hit or ram) until the whole hull is inside. Every entry allows both kinds; the type is a seeded weighted pick. Runtime filter = entry distance to the player's **current** position ≥ `minPlayerDist[kind]` (Chaser 448, Shooter 320: the rammer gets a longer runway, EN-06) and no ship (player included) within `occupancyRadius` of the arrival point. No entry is locked to a kind by position |
| Options screen | Exactly two settings: session seconds (60–180, step 10, default 120), spawn interval (1–10 s, step 1, default 3). Steppers + explicit Save. As built (M4): the value between the −/+ round buttons is a typed field (`inputMode=numeric`), so validation is real: `validateOptions` (config, Vitest) reports out of range, off-step (75 → "Use steps of 10 seconds."), fractional and non-numbers; the error shows on blur or Save (`role=alert`, `aria-invalid`, `aria-describedby` = limits + error), −/+ snap to the step and disable at the limits, visible limits text under each field. Save writes `pb:v1:options` and says "Saved. Applies to your next battle."; invalid drafts are not saved; stored data that fails validation falls back to the defaults |
| configKey | `s{sessionSeconds}-i{spawnIntervalSec}` (e.g. `s120-i3`). Records made with a non-default balance carry `custom: true` and are excluded from ranking |
| Dev panel | Behind `?dev=1` (persisted `pb:v1:dev` from M5; M1 reads the query only). Network tab: scenario select, reset server, clear outbox, flags. Balance tab: JSON textarea editing `GameConfig`, Apply → next match, Reset. On `/play`, `?dev=1` also draws the **map overlay** (§6). As built (M5): `?dev=1` turns dev mode on and `?dev=0` off (stored); a "Dev tools" pill (top-left of every menu screen) opens a `<dialog>` with two tabs. **Network:** scenario select with its description, Reset server, Clear outbox, outbox counts (waiting / failed) and the last 8 requests (method, path, status, ms) from the mock request log; changing the scenario or resetting invalidates every query. **Balance:** the `GameConfig` JSON (or the stored custom one); Apply validates JSON and shape (`config/balance.ts`: same keys and types as `GameConfig`, finite numbers; the error names the path, e.g. `arena.mapId must be text.`) and stores `pb:v1:devBalance`; a balance equal to the default is simply cleared; Reset clears it. The custom balance applies only while dev mode is on; "Exit dev mode" turns it off. The panel reaches the mocks through a context injected by `app/providers.tsx` (`ui/dev/devControls.ts` declares the interface), so `ui` never imports `mocks`. The map overlay stays tied to the `?dev=1` query on `/play` |
| Player identity | Generated UUID `playerId` + editable name, default "Captain Jack", stored `pb:v1:player`, sent as `X-Player-Id`. The name is edited **on the Main Menu** ("Captain Anne Bonny" + pencil round button → inline field, Save/Cancel, Enter/Esc), because a first-time player will not open Match History and Options must stay at two settings (CFG-03). 2–20 characters after trimming and collapsing spaces; letters, numbers, spaces, `'`, `.`, `-`. The pack has no pencil icon, so the pencil is a small inline SVG in the pack's round button |
| Ranking rows | One row per match; all rows of the local player get the YOU badge; default view = current options |
| Tie-break | score DESC → effectiveSec ASC → playedAt ASC → matchId ASC |
| Ship colors | Player = black/skull (color index 1). Chaser = red/cross (2). Shooter = blue/horse (4) |
| Enemies | Shooter common (0.7), Chaser rare (0.3): **slower than the player (105 vs 120) but rams for 30**, so it can always be outrun in a straight line but punishes being ignored or cornered (play-test: with no rear cannon, a faster Chaser behind you made the hit unavoidable). First two spawns forced one of each. Cap **6** alive (was 12; play-test: "too many enemies") |
| Shooter weapon | Cannons are an array per ship kind, each with its own cooldown. Ships with `[front]`; sides are two appended config entries (stretch #1). Must be aligned within `aimTolerance` and have line of sight |
| Fire behavior | Hold to fire at cooldown rate (level-triggered). Cooldown sweep on fire buttons via one CSS animation per shot |
| Ship contact | Chaser↔player: damage + chaser self-destructs (no score). Shooter↔player: push apart, no damage; Shooter AI keeps a standoff distance. Enemy↔enemy: **pushed apart half each** (added after play-test: enemies stacked in lanes) plus separation steering. No friendly fire |
| Health | 100, no regeneration, no pickups |
| Pause | Manual (P, Esc or the HUD pause button) + auto on blur / hidden / portrait. Portrait means `(orientation: portrait) and (pointer: coarse)`: only touch devices, so a tall desktop window keeps playing. Resume by the Resume button, P or Esc (no countdown unless stretch). A key held through a pause must be pressed again after resuming (auto-repeat is ignored). Input cleared on every lifecycle change and on dispose |
| Pause → Options | Does not exist. Pause dialog = Resume / Main Menu |
| Match end | The sim stops at once (MR-04); the frozen arena shows a banner for 1.2 s ("Time's up!" or "Your ship was sunk!"), then the **Result dialog opens over the frozen match**, like Pause (not a separate page: a page of its own is only worth it if it showed the history). Surviving until time runs out is a win: Result headline "You survived the attack" (caption `TIME'S UP` in green); defeat: "Your ship was sunk" (`DEFEATED` in #F08A7A) |
| Mobile | Landscape only; portrait shows a rotate overlay and auto-pauses. On wide phones the arena leaves fog zones left and right; the touch buttons (M4) sit there, so thumbs never cover the playable water. As built: two clusters in the bottom corners like `sample.png` (steering: forward raised between turn-left/turn-right; cannons: bow raised between left/right broadside), 64 px sprites, shown only on `(pointer: coarse)`; on 915×412 they sit in the fog zone with a few px over the arena's fog band; on 640×360 (no fog zone) they cover the arena's bottom corners, which are fog/edge water. The rotate overlay is shown only in the game (menus work in portrait) and replaces the Pause dialog while portrait (a modal dialog would sit above any overlay in the top layer); rotating back shows the dialog |
| Routing | Real URLs `/`, `/options`, `/play`, `/result`, `/log`. Reload on `/play` → menu (match abandoned, never recorded, CFG-06). A match starts only from an in-app navigation: any POP onto `/play` (reload, typed URL, Back/Forward) redirects to the menu, except with `?dev=1` so the map-editing reload loop keeps working. Game → Result, Pause → Main Menu and both Result buttons replace the history entry, so Back never lands on a finished match. `/play` and `/result` are children of one pathless layout route (`GameRoute`), so the frozen match stays mounted when the URL changes to `/result`. Reload on `/result` → the same Result dialog over a **snapshot of the battle's final frame** (the match itself is gone, CFG-06), from the router history state (as built M5: the `MatchRecord` travels in the history state and `pb:v1:lastResult` backs it up); a fresh tab (no history entry) shows the last result from local storage over a plain sea gradient, or "No battle yet" |
| Audio | Out of scope |
| Pending display | Result screen status row + menu badge. History shows confirmed rows only. As built: the badge is a gold count on the Match History button (with visually hidden ", N battles waiting to be saved"); it counts pending and in-flight items, not permanently failed ones |
| Dates | `08 SEP · 21:42`, local time, en-GB month abbreviations |
| Page size | 5; history newest first |
| Bindings | W/↑ forward · A/D or ←/→ turn · Space fire front · Q/E broadside left/right · P/Esc pause. `event.code` based. No remapping |
| Loop | Fixed 60 Hz step with accumulator, **no render interpolation**; own rAF loop via injectable `Clock`; Pixi ticker off (`autoStart: false`, manual `app.render()`) |
| Hulls | Two circles per ship (centers ±22 px along heading, r 26); projectiles swept as segments |
| Ship movement | **Acceleration and drag are mandatory**: forward speed ramps toward max while thrusting and coasts down when not; **turning has rudder inertia** (turn speed ramps up and eases out); every contact (islands, arena edge, other ships) slides instead of stopping dead. Same model for player and enemies (§7) |
| Arena edge | **Soft edge**: inside a one-tile band the sea resists outward motion, harder the deeper the ship is and the more directly it heads out; a ship heading inward or along the rim is never pushed, so ships slide along the rim and arriving enemies are never thrown forward. Shown by **white, cloudy open-sea mist** drawn above ships along the rim; enemies sail in out of it (§3) |
| Avoidance | Island-corner detours when line of sight is blocked + feelers + separation steering + enemy↔enemy push-apart + stuck rule (§7, §8); the flow field is no longer needed |
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
  app/        main.tsx (dev flag → startMsw → setOffline → startOutbox → render), startMsw.ts, router.tsx, providers.tsx
              (QueryClientProvider + dev controls context)
  config/     gameConfig.ts, userOptions.ts (limits, validate), matchConfig.ts (snapshot, configKey, custom, isCustomBalance),
              balance.ts (validateBalance for the dev panel's JSON)
  shared/     clock.ts (Clock, RealClock, ManualClock), rng.ts (mulberry32), storage.ts (read/write JSON, safe fallback), uuid.ts
              (randomUUID, getRandomValues fallback for plain-HTTP LAN testing), math.ts, bindings.ts (moved from input at M4:
              the menu builds its controls table from it and ui may not import input),
              mapData.ts (MapData, MapSource types: shared because assets implements MapSource and may import only shared),
              format.ts (formatClock mm:ss)
  sim/        entities.ts (types), world.ts (createWorld, createShip, hull circles, effects, damageStage), grid.ts (solid
              mask, rounded island corners, island bounds, DDA raycast, circle push-out), step.ts,
              systems/ (ai, movement, weapons, projectiles, collision, damage, spawn, lifecycle = cleanup + effects + endCheck)
  render/     stage.ts (layers + per-frame draw), views/ (ShipView, HealthBarView), effects.ts, fog.ts, viewport.ts, debugOverlay.ts
  input/      inputState.ts (keys by code + button actions → ShipIntent), keyboard.ts (touch buttons call setAction directly)
  shared/     … + intent.ts (ShipIntent, shared by input and sim)
  assets/     manifest.ts, loader.ts (ensureLoaded), parseTiledMap.ts (pure JSON → MapData, used by Vitest), tiledMap.ts (MapSource impl)
  session/    GameSession.ts, loop.ts, lifecycle.ts, store.ts, perfProbe.ts
  data/       contracts/ (types.ts, ranking.ts comparator + test, record.ts parse + server-side checks), http.ts (Axios,
              ApiError, offline flag), api.ts, queries.ts (QueryClient, keys, useRanking/useHistory, save mutation options),
              outboxReducer.ts (+ test), outbox.ts (store, flusher, lastResult, useOutbox), local.ts
  mocks/      handlers.ts, fixtures.ts, scenarios.ts, fakeDb.ts, requestLog.ts, browser.ts
  testing/    testApi.ts
  ui/         screens/ (Menu, Options, CaptainsLog), game/ (GameRoute = /play + /result layout, GameHost, Hud, TouchControls,
              PauseDialog, ResultDialog), components/ (WoodPanel, GoldButton, RoundButton, GameDialog, Tabs), a11y/ (LiveRegion), dev/ (DevPanel, devControls),
              sprites/ (UI PNGs copied by convert-assets, name.png + name@2x.png, used from CSS modules)
public/       mockServiceWorker.js, assets/ (ships, tiles, tiles@2x, ui_sheet, ui_sheet_retina: JSON + PNG), maps/archipelago-1.json
scripts/      convert-assets.ts (Sparrow XML → Pixi JSON; tile grid → JSON 1×/2×; UI sheet copied), build-map.ts +
              maps/archipelago-1.txt (authored layout), perf.spec.ts, memory.spec.ts. Output under public/ is committed.
e2e/          fixtures/pbPage.ts, specs/test-01..12.spec.ts, __screenshots__/
docs/         ARCHITECTURE.md, README sections, licenses.md, perf/REPORT.md, reports/
Dockerfile    multi-stage: node:24-alpine build (VITE_COMMIT_SHA build arg) → nginx:alpine serving dist on :8080, healthcheck
nginx.conf    SPA fallback for extensionless paths only; cache rules per path (see §16)
docker-compose.yml  one service, restart unless-stopped; .dockerignore keeps the build context small
```

Vite `build.assetsDir` is `static`, so hashed bundles (`/static/*`, cached immutable) never share a folder with the
unhashed files copied from `public/assets/` (`/assets/*`, revalidated).

## 3. React ↔ PixiJS bridge (ARCH-01/04/08/09)

- The `/play` and `/result` routes share the layout `ui/game/GameRoute`, which loads `GameHost` with `React.lazy` inside `Suspense` (fallback: the same
  "Loading the fleet…" status). Everything that imports `pixi.js` sits behind that boundary, so the menu, Options and Captain's
  Log never download Pixi (build at M5: `index` ≈ 441 kB with React, router, TanStack Query, Axios and the data layer; `GameHost` ≈ 300 kB with Pixi + session; the MSW chunk `browser` ≈ 431 kB; no chunk-size
  warning). Nothing outside `ui/game/GameHost` and below may import `session`, `render` or `assets` statically.
- `GameHost` (React) creates a `GameSession` in `useEffect([matchConfig])`, calls `start()`, returns `() => dispose()`.
  `matchConfig` must be a stable snapshot object created on navigation to `/play`; Play Again creates a new one.
- `GameSession.start()`:
  1. `await assets.ensureLoaded(p => publish({loadProgress: p}))`
  2. `const app = new Application(); await app.init({ resolution: dpr, autoDensity: true, autoStart: false })` (as built: `resolution: min(dpr, 2)`, the §22 fallback, applied from the start)
  3. `if (this.disposed) { app.destroy(true); return }` ← Strict Mode guard after **every** await
  4. append canvas, build stage, attach input, start loop, `publish({ matchState: 'ready' })`
- `dispose()` is idempotent: flag → stop loop → detach input + blur/visibility/orientation listeners → disconnect ResizeObserver
  → drop store subscribers → `stage.destroy({children:true, texture:false})` → `app.destroy(true, {children:true, texture:false})`
  → null out world/render/app. Textures live in `Assets` for the app lifetime.
- One Pixi `Application` per match. While it lives, Pixi itself registers `pointerup` on window, `pointermove` on document and a
  `ResizeObserver` on its canvas (even with `eventFeatures` off); `app.destroy()` removes all three (verified at M1 exit: listener and
  observer counts return exactly to baseline after mount/unmount/mount in dev Strict Mode).
- The session store is created by `GameHost` (`useState`) and injected into each `GameSession`, so a Strict-Mode remount reuses
  the store while the disposed session can no longer publish. `dispose()` is synchronous.
- Store: `SessionStore { getSnapshot(): HudSnapshot; subscribe(cb) }` consumed with `useSyncExternalStore`; published after each frame
  only when a field changed (`Object.is` per key). Edge events (`weaponFired{side, cooldownMs}`, `playerHit`, `enemyDestroyed`) via `handle.on()`, no state.
  As built (M4): `GameSession.on(event, cb)`; the session derives the edges after each step by comparing the player's cannon
  `readyAt`s (one `weaponFired` per group that fired), health and score with their values before the step, so the sim is untouched.
  UI consumers act imperatively (Web Animations on the fire button's sweep and the HUD bar), never through React state.

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
  dispose(): void
}
```

Who draws what: Pixi = tiles, ships, shots, effects, open-sea fog, over-ship health bars. React = HUD (health/score/time),
touch buttons, pause button, dialogs, live region. Cooldown sweep = a `conic-gradient` overlay on the fire button whose registered
`@property --sweep` angle is animated 0 → 1 turn over `cooldownMs` with `element.animate()` when `weaponFired` arrives.
Pixi draw order: **sea** → baked tiles → ships → projectiles → effects → **fog** → health bars.
- Sea (built at M1): a `TilingSprite` of the water tile reaching 2048 px beyond every arena edge, starting on a tile boundary so
  the pattern continues seamlessly from the baked arena; it fills any screen shape (even 32:9) instead of letterbox bars.
- Fog (M2): a static sprite built once per session, painted on a small canvas (one pixel per 8 world px, smoothed on upscale).
  It is **white-blue cloudy mist** (`fogColor 0xe4edf2`, changed from navy after play-testing: "cloudy, not dark"). Inside the
  arena its density rises toward the rim up to `fogAlpha`, and deterministic two-octave value noise (render-side hash, no RNG)
  varies both density and reach (0.7–1.3 × `fogWidth`), so the inner edge is an irregular line of cloud puffs, not a band;
  **beyond the rim it keeps thickening to fully opaque about one tile out and stays opaque to the end of the sea** (a cloud
  bank; on wide phones the side zones are this bank). It sits above ships, so a ship near the rim is visibly swallowed by haze
  (the cue that the edge pushes back), and arriving enemies, created 64 px outside, are fully hidden and emerge from it. The
  opaque outer fog replaces any mask or frame. Health bars stay above it so information is never hidden; arriving ships show no bar.
Sea and fog textures are destroyed with the stage (the sea shares the atlas texture, destroyed with `texture: false`).

## 4. Simulation loop and time (ARCH-03, MR-09/10)

```ts
interface Clock { now(): number; onFrame(cb: (t: number) => void): () => void }
// RealClock = performance.now + requestAnimationFrame. ManualClock.advance(ms) fires cb once per 16.667 ms of accumulated
// time, however advance() is chunked (it tracks the next frame time; an early version dropped frames for advances < 16.667 ms).
// Verified at M2: the same seed + scripted input through startLoop + ManualClock gives an identical world for 1000 ms and 7 ms
// chunks, and equals calling step() directly.

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
  3  movementSystem               // rotate, accelerate/drag, move, edge push + clamp, island slide, speed from actual motion (both factions)
  4  weaponSystem                 // per-cannon cooldowns, spawn projectiles
  5  projectileSystem             // swept move, range/lifetime
  6  collisionSystem              // shot↔ship, chaser↔player, shot↔island → hits queue, consumed flag
  7  damageSystem                 // apply once, mark dead, score (killedBy)
  8  spawnSystem                  // interval timer, authored points
  9  cleanupSystem                // remove dead/consumed → pools
  10 effectSystem                 // explosion/flash lifetimes
  11 endCheck                     // hp ≤ 0 → defeated (wins ties); time ≤ 0 → timeUp
```

As built (M6): the frame callback is `(time, lastOfBatch)`. `RealClock` always passes `true`; `ManualClock.advance(ms)` passes
`true` only for the last frame of the call, and the loop draws only then (every frame still steps and publishes the HUD, and state
changes such as ready → running still happen on every frame). A 60 s `advance` takes about a second in headless Chromium instead of
a minute of software-WebGL frames. Because of float accumulation, a 60 s session ends on step 3601 (tests advance 61 s).

Rules: sim time advances only inside `step`; no `setTimeout` in sim; all timers (cooldowns, spawn, lifetimes) are
`w.time`-relative. Pause zeroes the accumulator on resume. `world.rng` (seeded) is used only by sim systems;
render uses a separate RNG. Entity model: plain data arrays (`ships[]`, `projectiles[]`, `effects[]`) + system functions;
projectiles and effects pooled; stable incrementing ids.

## 5. Configuration (CFG-01..05)

```ts
export const GameConfig = Object.freeze({
  arena:   { cols: 24, rows: 14, tile: 64, mapId: 'archipelago-1', edgeBand: 64, edgePush: 240, fogWidth: 96, fogAlpha: 0.55 },
  player:  { maxHealth: 100, speed: 120, accel: 150, drag: 90, turnRate: 2.4, radius: 26, colorIndex: 1,
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
    chaser:  { maxHealth: 40, speed: 105, accel: 180, drag: 120, turnRate: 2.4, radius: 26, impactDamage: 30, colorIndex: 2, cannons: [] },
    shooter: { maxHealth: 60, speed: 110, accel: 130, drag: 90, turnRate: 2.0, radius: 26, colorIndex: 4,
               attackRange: 380, minRange: 220, aimTolerance: 0.26,
               cannons: [ { id: 'front', group: 'front', angle: 0, offset: 0, damage: 10, speed: 360, range: 440, cooldown: 2.2 } ] },
               // stretch: append { angle: -90 } and { angle: 90 } entries for side cannons
  },
  spawn:   { weights: { shooter: 0.7, chaser: 0.3 }, forceBothWithin: 2, maxAlive: 6,
             minPlayerDist: { shooter: 320, chaser: 448 }, occupancyRadius: 80 },
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

Units: px/s, px/s² (accel, drag), rad/s, seconds; logical pixels of the 1536×896 world. Balance numbers are placeholders; tune once in M2's last 30 min.

**As built (M2), `src/config/gameConfig.ts` is the source of truth**; it is typed as `BalanceConfig` and deep-frozen. Additions to
the block above: per ship `hullOffset: 22`; per cannon `muzzle` (front 56, broadside 30: distance from the hull where the ball
appears); per ship `turnAccel` (rad/s²: player 5, chaser 6, shooter 4.5); tuned after play-testing: player `turnRate 1.7`
(was 2.4, "too fast"), Chaser `speed 105 / accel 180 / turnRate 2.4 / impactDamage 30` (was 165/220/3.0/35, then 140/…/15; final: slower than the
player but turns tighter, so it is outrun in a straight line, not out-turned; measured with scripted players over 25 seeds: a
player who turns and fires sinks 37 Chasers and takes 34 rams, versus 28 and 50 with the 140/15 Chaser), Shooter `turnRate 1.6`;
`arena.fogColor 0xe4edf2`, `fogWidth 128`, `fogAlpha 0.8`; `spawn.arrivalSpeed 0.5` (share of top speed at creation);
`ai.steerGain 4`, `ai.steerDeadZone 0.01`;
`islands.cornerRadius 26`; `ai` = separationRadius 110 (was 70), feelerLength 48, stuckAfter 1, stuckCommit 1.5, orbitFlipAfter 0.5,
detourClearance 48, detourReach 40, detourStickiness 1.15, aimLead 0.4, aimThrust 0.35, weights chase 1 / separation 1 (was 0.6) /
feeler 1.2; `spawn.arrivalMargin 16`; `effects` durations (muzzle 0.12, impact 0.3, explosion 0.7, wreck 1.8, hitFlash 0.12).
`forceBothWithin` is implemented as a seeded shuffle of [chaser, shooter] consumed by the first two successful spawns.
`MatchConfig` = deep clone of the balance + options + `configKey` + `custom` + `seed`, frozen at creation.
Ship sprites: file `ship_{n}` with `stage = floor((n-1)/6)`, `color = (n-1)%6`; bow faces +Y in the source, so `sprite.rotation = heading − π/2` (verified at M1). Heading: radians, 0 = +X, clockwise positive (screen y down).

## 6. Map data (D-A/B/C)

```ts
// src/shared/mapData.ts
export type MapData = {
  id: string; cols: number; rows: number; tile: number
  layers: Array<{ name: string; tiles: number[] }>   // water, shallows, land, decor; sheet index, -1 = empty; row-major
  solid: Uint8Array                                  // 1 = blocks ships and shots; derived from the land layer
  playerStart: { x: number; y: number; heading: number }
  spawnPoints: Array<{ x: number; y: number; heading: number; kinds: Array<'chaser'|'shooter'> }>  // on the arena edge, heading inward
}
export interface MapSource { load(id: string): Promise<MapData> }
```

**Tile sheet facts (verified from the file, replaces the Tiled probe):** 16×6 grid of 64 px, no margin, index = `row·16 + col`
from top-left. Water = 72 (the only water tile). Sand island = 3×3 slice (0–2, 16–18, 32–34). Sand+grass island = native 4×4
block (5–8, 21–24, 37–40, 53–56). Shallow-water ring = 3×3 slice (9–11, 25–27, 41–43). Transparent decor: rocks 48–50/64–66,
plants 69–71/86–87. The sheet has no sand-to-water inner corners, and its edge tiles are shaded toward the coast, so repeating
them shows a hard seam: **islands are exactly 3×3 (sand) or 4×4 (grass); concave or larger islands are not possible with this pack.**

**Authoring (no Tiled):** `scripts/maps/archipelago-1.txt` is a 24×14 character grid (`.` water, `s`/`g` island cells,
`S`/`G` interior cells with a decor overlay, `P` player start, `0–9` spawn entries on **border cells, not corners**).
`scripts/build-map.ts` validates the layout (rectangular islands of the allowed sizes, ≥ 3 tiles of water between land masses and
to the arena edge, decor on interior cells only, spawn digits on the border, one `P`) and writes Tiled-compatible JSON (tile
layers `water`, `shallows`, `land`, `decor`; object layers `spawns` and `player`) to `public/maps/archipelago-1.json`, so the map
can still be opened in Tiled. Each spawn digit becomes an entry point **on the arena edge** at the centre of its border cell,
with rotation facing straight inward (top 90, right 180, bottom 270, left 0), plus a `kinds` property written as
`chaser,shooter` for every entry. The field stays in the format so a future map could restrict an entry; this map doesn't, and
no rule locks kinds by position (spawn safety is the runtime distance filter, §8). The player object has rotation 270 = north.
Current layout: grass islands top-left and bottom-centre, sand islet top-right, player start in the lower-left water (col 8,
row 11) facing north; entries 0–3 along the top, 4 right, 5–8 along the bottom, 9 left, none aimed straight at an island.
`assets/parseTiledMap.ts` converts to `MapData`. All tile layers are drawn once into a `RenderTexture` at renderer resolution and
shown as one sprite; the texture is destroyed with the stage. Vitest (`parseTiledMap.test.ts`): ten entries, each on the arena
edge facing straight inward, with a clear 3×3 water lane in front (EN-06) that reaches the player start through water (BFS in
the test only).
Island corner tiles are rounded with transparent corners: collisions (M2) inset the outer corners so ships don't stop short.

**Editing the map (goes into the README at M7).** Run `npm run dev` and `npm run map:watch` side by side, open
`/play?dev=1`, edit `scripts/maps/archipelago-1.txt` and save: the watcher rebuilds `public/maps/archipelago-1.json` and a
dev-server plugin (`vite.config.ts`) reloads the page. A layout that breaks a rule is not written; the watcher prints the rule
and cell (e.g. `sand island at 8,3 must be 3x3`) and keeps watching. The overlay (`render/debugOverlay.ts`, added on top of the
stage when `?dev=1`) draws the grid numbered like the text file, solid cells, an arrow coming in from the edge at each spawn
entry (numbered as in the file), the player start with its heading, and the line where
the edge push starts (`edgeBand`); a
DOM legend explains the colours. `npm run convert-assets` rebuilds the map once without watching.
`GameConfig` starts in M1 with its `arena` section only (map id, edge band and push, fog); the map's size comes from `MapData`.

## 7. Collisions (CB-01..06)

| Pair | Test | Response |
| --- | --- | --- |
| Ship ↔ island | each hull circle vs solid tiles in its 3×3 neighbourhood (circle↔AABB), two passes | push out along min-penetration axis, keep tangential velocity (slide) |
| Ship ↔ arena edge | each hull circle's outer edge vs the arena bounds: soft band `edgeBand` px wide inside the edge, hard limit at the edge | in the band: move inward along the edge normal by `edgePush · depth/edgeBand · max(0, heading · outwardNormal)` px/s (only ships heading out are pushed); at the limit: clamp, removing only the outward component (slide). No damage |
| Shot ↔ island | DDA walk of the tile grid along this tick's segment | consume at first solid tile, splash effect |
| Shot ↔ ship | swept segment vs each hull circle (r + 5), opposing faction only | earliest hit wins; consume; push `{targetId, amount, sourceId}` to hits |
| Chaser ↔ player | any hull circle pair | player −impactDamage; chaser dead with `killedBy: 'self'` (no score), explosion |
| Shooter ↔ player | hull circles | push both apart half-way, no damage |
| Enemy ↔ enemy | hull circles (arriving ships skipped) | push both apart half-way, no damage; separation steering keeps them fanned out before contact. Measured headless (15 seeds × idle and moving player, 120 s): deeply overlapping enemy pairs 16 % of enemy-ticks before, 0 % after |
| Anything ↔ arriving enemy | skipped | arriving ships can't be hit, can't ram, don't separate (§8 Arrival) |

**Movement model (collide and slide).** A ship has `heading`, a scalar forward `speed` and a `turnVelocity`. Each tick:
`turnVelocity` moves toward `turn · turnRate` at `turnAccel` rad/s², then `heading += turnVelocity · dt` (rudder inertia);
`speed` moves toward `thrust ? max : 0` at `accel` (thrusting) or `drag` (coasting) px/s²; intended displacement = heading · speed · dt;
then edge push, edge clamp and island push-out correct the position. Finally `speed = clamp(dot(actual displacement, heading) / dt, 0, speed)`,
so a ship pressed head-on into land or the rim bleeds speed to zero instead of storing it, and one meeting it at an angle keeps
the tangential share and slides. There is no reverse; releasing thrust coasts. Turning is allowed at any speed. Equilibrium in the
edge band at full speed is `edgeBand · speed / edgePush` deep (≈ 32 px for the player), so the hard limit is rarely touched.
Arriving enemies skip the edge push and clamp (they start outside the arena); the band applies from the tick they finish arriving.
Because the push only resists outward headings, a ship that has just arrived (heading inward) is never shoved: an earlier version
pushed every ship in the band, which threw new arrivals forward at up to 240 px/s ("slow, then suddenly fast", play-test bug).
Measured headless: an enemy's movement from creation to one second after arrival never exceeds its own top speed.

As built (M2): the speed clamp measures displacement **excluding the soft edge drift** (the drift is applied separately, like a
current), so pressing into the rim holds the ship in the band at full throttle while islands and the hard clamp still bleed
speed. Island tiles whose two outer neighbours are water get a rounded outer corner (`islands.cornerRadius`): a hull circle in
that corner zone collides with a circle instead of the tile box, so ships can cut the transparent corner of the art.
Grid islands are also stored as bounding rectangles (connected components) for the AI detours in §8.
Measured headless over 20 seeds (idle player, 60 s): zero ticks with a hull circle inside a solid tile.

No broad phase (≤ 13 ships × ~40 shots). Damage applied only in `damageSystem` from the hits queue; a projectile marked
`consumed` in step 6 cannot hit again (CB-04). Dead ships flagged in 7, removed in 9 (CB-06).

## 8. Enemy AI and spawning (EN-01..06)

```
steerTo(ship, dir): err = wrapAngle(atan2(dir) - heading)
  rate = min(turnRate, sqrt(2·turnAccel·|err|), |err|·steerGain)       // brakes before the target angle (rudder inertia)
  turn = |err| < steerDeadZone ? 0 : sign(err)·rate/turnRate; thrust = |err| < 90° ? 1 : 0.3
  (a plain sqrt controller chattered left/right ~16 times per enemy-second; with the linear zone and dead zone: ~0.24)
desired(enemy) = normalize(toPlayer*1.0 + separation*0.6 + feeler*1.2)
  separation = Σ (pos - other.pos)/d² for enemies within 70 px   (as built: linear falloff 1 − d/110 within 110 px, weight 1)
  feeler     = 48 px ray ahead vs solid mask → lateral nudge when blocked
  stuck rule = blocked > 1 s → commit to one turn direction for 1.5 s
CHASER : steerTo(desired), full thrust; contact handled by collision
SHOOTER: d = dist(player)
  d > attackRange → steerTo(desired)
  d < minRange    → steerTo(-toPlayer + separation + feeler)          // back off
  else            → steerTo(perp(toPlayer)*orbitSign + feeler*1.2)     // orbit; orbitSign flips when blocked > 0.5 s
  for each cannon: if |wrapAngle(cannonDir - angleTo(player))| < aimTolerance and cooldown ready and lineOfSight → fire
lineOfSight reuses the shot↔island DDA.

As built (M2), two changes found by watching seeded matches:
- **Detours around islands.** Feelers and the stuck rule cannot handle an island directly between an enemy and the player (a
  Chaser slid back and forth along the island's edge for 6 s). When there is no line of sight to the player, the chase target
  becomes the best island detour point: the corners of every island's bounding rectangle pushed out by `detourClearance`,
  filtered to those visible from the enemy and not already reached (`detourReach`), scored by
  `|enemy→point| + |point→player|`; the current point is kept unless a new one is `detourStickiness` better. Islands are
  guaranteed rectangles, so one or two hops always suffice. This replaces the flow-field contingency. Shooters without line
  of sight also chase (so they come around to get a shot).
- **Shooters aim when loaded.** With a front-only cannon, pure orbiting points the cannon tangentially and never fires. In
  the orbit band a Shooter turns to face the player at `aimThrust` when any cannon is ready within `aimLead`, and orbits while
  reloading. If stretch #1 adds side cannons, orbiting broadsides work without this rule.
Measured headless over 20 seeds with an idle player at the start: Chaser arrival→ram median 4.8 s, p90 11.6 s (far entries);
Shooters fire about 0.2 shots per second each; an idle player sinks in 15–32 s at the default 3 s interval.
```

As built (M7), Shooter aim retuned (stretch #2, raised at M3 play-testing: "Shooters hit almost every shot"). Measured with a
headless bench (20 seeds × 180 s, 3 s spawns, Shooter-only, invulnerable scripted player): the old rule fired as soon as the bow
entered the ±0.26 rad window, so it shot 15° off a still target (idle hit rate 9.3%) but the entry edge led a moving one (a bot
sailing between visible waypoints at ≈ 95 px/s: 32.0%). Precise aim alone was worse (55–68% on every moving bot): Shooters trail
the player and fire down its 96 px hull. The rule now:
- each Shooter keeps `ai.track`, an estimate of the player's position following it with an exponential lag (`aimLag` 1 s:
  `track += (player − track) · min(1, dt / aimLag)`), so a ship that keeps sailing is aimed behind;
- it aims at the track plus a per-volley error in ±`aimSpread` (0.3 rad) drawn from `world.aimRng`, a second stream seeded from
  the match seed, so the spawn sequence and every spawn fact in §17 are unchanged; the error is re-rolled after each shot;
- it steers toward that aim while loaded and fires only when ready and within `aimTolerance` (0.26 → 0.08 rad);
- its ball flies at 200 px/s instead of 360: visible, and a ship fleeing at 120 px/s from ≥ 220 px outruns the 440 px range.
Hit rate before → after: idle 9.3% → 61.3%; waypoint sailing 32.0% → 19.5%; stop-and-go 29.1% → 26.1%; slow circling
through islands (≈ 72 px/s) 24.7% → 36.4%. Sitting still is punished and sailing is the defence. With seed 42 an idle player no
longer survives 60 s at a 10 s interval (sunk at ≈ 47 s), so the time-up specs moved to seed 143 (§17).

Spawning: `nextSpawnAt += spawnIntervalSec` in sim time (timer keeps advancing even when a spawn is skipped).
Order per spawn: pick the type first (seeded weighted pick; the first two spawns are forced one of each in seeded order, so both
types appear in every standard match), then keep the entries whose `kinds` include it, whose distance to the player's current
position is ≥ `minPlayerDist[type]`, and with no ship (player included) within `occupancyRadius` of the arrival point
`entry + heading · tile`; pick one of those with the seeded RNG. Skip when `alive ≥ maxAlive` or no entry passes. A skipped
forced type stays first in the queue for the next interval. The spawn counts (score timeline, `maxAlive`, TEST-05) at creation.
EN-06 reasoning: an arriving Chaser enters at half speed and is harmless until fully inside (~1.5 s), then starts ≥ ~350 px
away at up to 105 px/s, slower than the player, which leaves ~4 s from first sight in the mist to impact, and a straight-line
escape always works; enough to turn away or land the two front-cannon hits that sink it.

**Arrival.** A new enemy is created at `entry − heading · (hullExtent + 16)` (hullExtent = hull offset + radius = 48 px, so it
starts 64 px outside and fully hidden), with `heading` = the entry's inward heading, `speed` = `arrivalSpeed` (0.5) × its
max speed, and `arriving = true`. While arriving: AI is skipped and the intent is full thrust straight ahead, so the ship
visibly accelerates out of the mist (measured: 50% of top speed at creation, 100% when arrival ends); `movementSystem` skips
the edge push and clamp; `weaponSystem` skips it; `collisionSystem` ignores it for shots, ship contact and separation.
`arriving` clears on the first tick both hull circles are fully inside the arena (each centre ≥ radius from every edge),
≈ 1 s after creation. The ship appears out of the opaque cloud bank beyond the rim (§3), which hides the part still outside.
Enemies use the same `movementSystem` as the player; AI writes intents only.

## 9. Match lifecycle (MR-*, CFG-06)

States: `loading → assetError ⇄ (Retry) → ready → running ⇄ paused → resuming → running → ended{timeUp|defeated} → disposed`.
- Only `running` steps the sim; others repaint. `GameSession` owns the state; every change goes through one `enter(state)` that
  attaches the gameplay listeners (keyboard + auto-pause) only for `running`/`resuming`, clears input, and publishes `matchState`.
- `ready` lasts one frame (stage built, first frame drawn, no step); `resuming` likewise. Both then enter `running`, or `paused`
  if play is blocked (`document.hidden` or touch portrait), so resuming in portrait stays paused.
- Pause triggers (`session/lifecycle.ts`): P/Esc keydown (non-repeat), the HUD pause button, window `blur`, `visibilitychange` to
  hidden, and the portrait query turning true. Resume = the dialog's Resume button, P, or Esc (the native `<dialog>` `cancel`).
  The dialog swallows auto-repeated Esc/P and stops P from reaching the window listeners that `resuming` attaches during the same
  event, so holding either key never flips paused → running → paused.
- `ended` entered from `endCheck`; `getResult()` returns `{ score, effectiveSec: floor(w.time), endReason, matchConfig, seed }` once.
  `GameHost` takes it when `ended` is published, shows the end banner for 1.2 s, then `navigate('/result', { replace, state })`.
  `GameRoute` keys `GameHost` by the `location.key` of the last `/play` entry, so on `/result` the same `GameHost` (and its ended
  session, arena and HUD) stays mounted under the `ResultDialog`; Play Again replaces to `/play`, whose new key remounts a fresh
  `GameHost`. Leaving the layout (menu, Back) unmounts it and disposes the session. On a fresh load of `/result` there is no
  match to show, so the dialog sits on a snapshot of the final frame: right after the first `ended` frame is rendered, the
  session copies the WebGL canvas (same task, so the drawing buffer is still intact without `preserveDrawingBuffer`) onto a 2D
  canvas ≤ 1280 px wide and keeps it as a JPEG data URL (q 0.72, ≈ 170 kB at 1280×720; `render/snapshot.ts`). `GameHost` sends
  it as `state.endFrame` with the result; `GameRoute` accepts only a `data:image/jpeg;base64` string and shows it `cover`ed
  under the dialog's dimmed backdrop. It stays in the history entry only (not in local storage, even from M5), so a new tab on
  `/result` falls back to the sea gradient. Until M5 the result travels in the router's history state (survives a
  reload of `/result`; a fresh tab shows "No battle yet"); M5 writes `pb:v1:lastResult` + the outbox item first (§14).
  As built (M5): `GameHost` takes the result as soon as `ended` is published and calls `recordFinishedMatch` (builds the
  `MatchRecord` with a new UUID, the player's id and name, `playedAt` now and the frozen `MatchConfig`), which writes the
  outbox item and `lastResult` synchronously and starts the flush, so the match counts as finished even if the page reloads
  during the 1.2 s banner. The navigation state is `{ record, endFrame }`; `GameRoute` accepts a record only if
  `parseMatchRecord` does, else falls back to `lastResult`.
- Main Menu / route change / reload during any state → dispose, nothing recorded (CFG-06). A POP onto `/play` redirects to `/`.
- Play Again → new `MatchConfig` snapshot + new seed → new session (a new `GameHost` mount with a fresh store).
- Verified at M3 (headless Chromium, dev Strict Mode): window `keydown`/`keyup`/`blur` and document `visibilitychange` listeners
  are 1 each while running, 0 while paused/ended and after leaving; world time identical across 2.5 s of pause; W held through a
  pause gives speed 0 after resume until pressed again; Space after a mouse pause/resume fires and does not re-trigger the focused
  pause button; the HUD DOM changed 6 times in 3 s of play (≈ 120 frames); on `/result` the ended session and its canvas stay
  mounted under the Result dialog, Esc does not close it, and a reload shows the same result over the final-frame snapshot (48 checks).

## 10. Assets (ARCH-05, A11Y-04)

- `npm run convert-assets` converts `ships_miscellaneous_sheet.xml` (Sparrow, 102 frames, no trim/rotation) → Pixi JSON, and the
  16×6 tile grid → Pixi JSON with frames `tile_<index>` (1× and 2×); `ui_sheet*.json` is already Pixi/TexturePacker hash format
  and is copied unchanged. Then it rebuilds the map. Output is committed, so the Docker build never needs the source pack.
- Asset URLs are absolute (`/assets/...`, `/maps/...`) so deep routes resolve them correctly. Vite's hashed bundles go to `/static/`.
- Pixi 8.21's loader drops a failed request from its cache and rethrows without logging, so `ensureLoaded` Retry really reloads.
- Manifest bundle `combat`: `ships` (1× only — retina copies are not 2×), `tiles`/`ui` chosen 1× or 2× once at boot by `devicePixelRatio > 1.5`.
- `ensureLoaded(onProgress)` memoises the promise at module level; on failure the memo is cleared so Retry works.
  Called inside `GameSession.start()` before `app.init()`; second match hits `ready` instantly. As built (M6): "instantly" is
  ≈ 40 ms (map fetch from cache + `app.init()`), during which the state is still `loading`; the loading panel therefore becomes
  visible only after 150 ms (a zero-length CSS animation holding `visibility: hidden`), so a cached load never flashes it (found
  by TEST-02). The same panel is the lazy-chunk fallback and gets the same delay.
- Texture index `textures.ship[stage][color]` built once. `ShipView` swaps texture when `damageStage(health/max)` changes (FX-03).
- Effects: explosion sprites scaled/faded in code (FX-02); muzzle flash = small explosion sprite 120 ms (FX-01); hit flash tint on the ship (FX-04).
  As built: `impact` burst where a ball hits a ship or an island; `wreck` = the ship's stage-3 sprite drawn under ships, fading
  and shrinking over 1.8 s. Effect and ball sprites are pooled in the render layer (index-mapped each frame, extras hidden).
- Over-ship health bars (MR-06): `enemy_health_frame` + fill (green for the player, red for enemies), scale 0.45, 70 px above
  the ship, flipped below it when there is no room at the top edge; hidden while arriving. The fill is clipped, not stretched,
  per the sheet's `fill_rect`/`clip_axis`: a `dynamic` texture whose `frame.width` and `orig.width` shrink together. Pixi 8
  sprites size themselves from `orig` and only listen to texture updates when the texture is `dynamic`; changing only `frame`
  stretches the fill instead (found at M2).
- React UI art (M3): `convert-assets` copies every UI PNG of the pack (`png/default/ui/{controls,hud,menu}` and the retina
  twins, checked to be exactly 2×) into `src/ui/sprites/` as `name.png` + `name@2x.png`. CSS modules reference them with
  `image-set(url(name.png) 1x, url(name@2x.png) 2x)`, so Vite hashes them into `/static/` (immutable) and inlines files under
  4 kB; a sprite downloads only when a rule using it matches. The Docker build context excludes the source pack, hence the copy.
  Primitives: `WoodPanel` = `panel_menu` as a 9-slice `border-image` (insets 40/32 px = 8.33 % of the image); `GoldButton` keeps
  the 256:88 sprite ratio with normal/hover/pressed/disabled states (secondary = navy variant); `RoundButton` = 64 px round sprite
  with a 32 px icon (≥ 56 px visible). HUD: `icon_heart` + `health_frame` with `health_fill_*` clipped to `fill_rect` by
  `clip-path` (green > 50 %, amber > 25 %, red below), `counter_panel` + `icon_score` / `icon_time`; scale 0.75, 0.6 when the
  viewport is ≤ 500 px tall.
- Menu art (M4): `convert-assets` also copies `ui_scene_background.png` (918×515, drawn `cover` and dimmed behind every menu
  screen and the loading/error panels), `logo_jungle_gaming.svg` (bottom-right) and the player ship `ship_2.png` (menu icon).
  Gold button padding is computed from `--button-width`, not a percentage: padding percentages resolve against the parent's
  width, which wrapped "MATCH HISTORY" inside wide panels (found at M4).
- Tests simulate failure via Playwright **`context.route`**`('**/ships.json', route => route.abort())`. `page.route` does not work
  here: once MSW's service worker controls the page, asset fetches are re-issued by the worker, and only `context.route`
  intercepts service-worker traffic in Chromium (found at M1). The same applies to any request-level interception in E2E.
  The aborted request makes Chromium log `Failed to load resource: net::ERR_FAILED`; the console-error fixture must allow that
  one message in the asset-failure spec. Headless Chromium also logs `GL Driver Message … GPU stall due to ReadPixels` warnings
  (software compositing of the WebGL canvas, not app code); the fixture fails on errors, not warnings.
- Licenses: `docs/licenses.md` (Kenney Pirate Pack CC0 — verify; UI pack from the challenge; no audio shipped).

## 11. Viewport (ARCH-06, A11Y-02/03)

`scale = min(W/1536, H/896)`; world container centered; the remaining screen shows the sea and fog beyond the arena (§3), not
bars (e.g. 915×412 phone: scale 0.46, ≈ 104 px of fog zone each side). `ResizeObserver` on the host drives
`renderer.resize(W, H)`; `resolution: devicePixelRatio, autoDensity: true` (as built: `min(devicePixelRatio, 2)`). HUD and touch layer are DOM, positioned against the
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

Keyboard listeners on `window` only while `running`/`resuming` (A11Y-07). As built: `attachKeyboard(input, onPause)`; keydown
with Ctrl/Meta/Alt is ignored (browser shortcuts such as Ctrl+P stay the browser's); the pause action fires on a non-repeat
keydown and is not a held key; blur handling lives in `session/lifecycle.ts` (blur → pause, which clears input). Because
repeats are ignored and listeners are detached while paused, a key held across a pause stays inert until pressed again (MR-10).
Touch layer: six `<button>`s with pointer events, `setPointerCapture`,
`pointercancel`/`lostpointercapture` release, `touch-action: none`. Menu renders the controls table from `bindings`.
As built: `pointerdown` prevents default (no focus, no text selection, no synthetic mouse events), captures the pointer and
calls `setAction(action, true)`; up/cancel/lost-capture call it with `false`; context menu suppressed; `tabIndex=-1` because
keyboard users have the keys. Each button captures its own pointer, so several fingers work at once (verified: forward + bow
cannon held together → speed 120 and a shot). A finger held across a pause stays inert after resume (input is cleared on every
lifecycle change and no new `pointerdown` arrives), matching the keyboard rule.

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

As built (M5):
- `data/contracts/types.ts` holds the shapes above plus `ApiErrorBody { code, message }` (what the mock server sends) and
  `SaveOutcome { record, created }`; page size 5. `EndReason` is redeclared here because `data` may not import `sim`.
- `data/http.ts`: one Axios instance (`baseURL /api`, timeout 8 s). The request interceptor adds `X-Player-Id` and, in offline
  mode, rejects at once with a non-retryable network error; the response interceptor turns every failure into an `ApiError`
  (timeout → `timeout`, no response → `network`, 404/409/422 → `not_found`/`conflict`/`validation`, else `server`; the message
  comes from the server body when present). `data/api.ts` checks the response shape (a page needs `items`, `page`,
  `totalPages`; a PUT answer must parse as a record), so an HTML fallback page never reaches the UI.
- PUT is idempotent by `matchId`: a new record → 201; the same record again → 200 with the stored one; the same `matchId`
  with a different body → **409** (added so a retry can never overwrite a stored record); invalid body, path/body `matchId`
  mismatch, `configKey` not matching the config, `custom` not matching the balance in the config (recomputed with
  `isCustomBalance`), or `effectiveSec` longer than the session → 422 with a message. The checks live in
  `data/contracts/record.ts` (`parseMatchRecord`, `recordProblem`) and are shared by the client and the mock server.

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

As built (M5):
- The outbox runs the save through a TanStack `MutationObserver` built from `saveMatchOptions` (the options a `useSaveMatch`
  hook would take: `mutationFn` = `putMatch(record, signal)`, retry 0, `onSuccess` invalidates `['ranking']` and `['history']`),
  because it must run outside React: at boot, on `online`, on its backoff timer and on Retry.
- `data/outboxReducer.ts` is the pure state machine (Vitest): `enqueue` (once per matchId) → `pending`; `submit` →
  `submitting`; `confirm` removes the item (that is the confirmed state); `fail` with a retryable error → `pending` with
  `attempts + 1` and `retryAt = now + 2·2^(attempts−1) s` capped at 30 s; a non-retryable error (422, 409) → `failed`, kept,
  never retried on its own; `retry` clears the backoff. On load, `submitting` items become `pending` (a reload aborted them).
- `data/outbox.ts` keeps `{ items, lastResult }` in memory, writes both keys on every change and exposes `useOutbox()`
  (`useSyncExternalStore`). The flusher submits due items one at a time, oldest first, with an `AbortController` per item
  (Clear outbox aborts them); that map is also the in-flight guard; after each pass it arms one timer for the earliest
  `retryAt`. It does nothing in offline mode. `lastResult.status` follows its item: `saved` on confirm, `failed` with the
  message on a permanent failure, `failed` ("Removed from the outbox.") when the dev panel clears it.
- Result status row (`saveStatusOf`): **Saving to the captain's log…** while in flight or not yet tried; **Not saved yet · retry
  in N s** + "Retry now" after a retryable failure (the countdown is `aria-hidden`, only the state text is in the
  `role=status`); **Not saved yet · kept on this device (offline mode)** without Retry when the mocks are down; **Saved to the
  captain's log**; **Couldn't save: message** for a permanent failure. Play Again keeps the initial focus (`data-autofocus`,
  honoured by `GameDialog`). A record played with a custom balance adds "Custom balance · not ranked".
- Log: `ui/screens/logView.ts` maps the query onto `LogView`; an error is hidden while a fetch runs, so Retry and the automatic
  retries show "Loading…"/"Refreshing…" instead of the old error, and the page shown during a placeholder is the requested one.
  Each tab is its own component, so switching tabs remounts its query and `refetchOnMount: 'always'` refreshes it (API-08).
  Ranking: rank `01`…, ★ on rank 1, gold points, a YOU pill on every row of the local player (`aria-current`), `08 SEP · 21:42`
  dates in local time from a fixed month list (en-GB `short` gives "Sept"). History: date, points, mm:ss duration, TIME'S UP
  (green) / DEFEATED (red), a CUSTOM pill for custom-balance records, the newest row (page 1) highlighted. Cells are
  left-aligned under their headers. On screens ≤ 500 px tall the Log switches to two columns (title, stacked tabs and Main Menu
  on the left, table on the right), so 5 rows fit at 640×360 and 915×412.
- Verified headless (dev and `vite preview`, 118 checks): a finished match appears in both tabs (you at 03 with 24 points, as
  in the mockup); `timeoutAfterSave` → PUT 201 hangs 12 s, the client gives up at 8 s, the automatic retry 2 s later gets 200,
  one record; "Retry now" saves in ≈ 0.7 s; `downThenRecover` → 503, 503, 201; the badge survives a reload and clears when the
  boot flush succeeds; 422 → failed, not counted in the badge; two quick invalidations where the older request answers last
  keep the newer data (API-09); `rankingFails` → 1 try + 2 retries (≈ 3.5 s), then the error with Retry, History unaffected;
  offline mode (worker script blocked) → banner, instant tab errors, the match still plays and waits on the device, saved
  after the next boot with mocks.

Panel states: pending (5 skeleton rows), fetching with data ("REFRESHING…" caption), placeholder (dimmed, pagination disabled),
empty ("No battles logged yet for this configuration." + Play), error without data (message + Retry, role=alert),
error with data (rows stay, "COULDN'T REFRESH · RETRY").
As built (M4): `ui/screens/LogTable` renders all six from a `LogView` (`rows` undefined = no data yet, `isFetching`,
`isPlaceholder`, `error`, `page`, `totalPages`) plus column definitions; M5 maps the TanStack Query result onto it. Tabs live
in the URL (`/log?tab=ranking|history`, switched with replace), arrow keys/Home/End move between tabs (roving tabindex).

## 15. Local persistence (versioned, validated, safe fallback)

`pb:v1:options` · `pb:v1:player` · `pb:v1:lastResult` · `pb:v1:outbox` · `pb:v1:mockDb` (fake server, capped 500 records) ·
`pb:v1:scenario` · `pb:v1:dev` · `pb:v1:devBalance`. Outbox and mockDb are separate on purpose.
As built (M5): `pb:v1:outbox` = array of `{ record, state, attempts, retryAt, error }`; `pb:v1:lastResult` =
`{ record, status: pending|saved|failed, error }`; `pb:v1:mockDb` = `{ dataset, records }` (the newest 500 are kept);
`pb:v1:scenario` = scenario id; `pb:v1:dev` = `true` or absent; `pb:v1:devBalance` = a `BalanceConfig`. Every record read back
goes through `parseMatchRecord`; invalid entries are dropped, not the whole key.
As built (M4, `shared/storage.ts` + `data/local.ts`): the version lives in the key; values are plain JSON; every read goes
through a parser (options → `validateOptions`, player → UUID v4 + name rules) and any exception, missing key or invalid value
returns the fallback (defaults / a newly generated player, written back once). Writes are wrapped too and report failure
(Options shows "Could not save: this browser is blocking storage.").

## 16. MSW (MSW-01..07)

Handlers are scenario-agnostic and read a `ScenarioContext` (latency fn, fail fn, saveBehaviour). Registry:

```
success · empty · manyPages (3 + 2 pages) · slow (2500 ms) · jitter (seeded 100–2000 ms) · outOfOrder (odd requests 3000 ms, even 300 ms)
timeout (12000 ms > 8 s client) · networkError · http4xx (422) · http5xx (503) · rankingFails · historyFails
timeoutAfterSave (PUT commits to fakeDb, then hangs 12 s) · downThenRecover (PUT fails until the 3rd attempt; GETs work)
```

Selection: `?scenario=id` (persisted), `?reset=1`, dev panel, `__PB_TEST__.setScenario`. Reset restores fixtures and zeroes
the per-scenario request counter. Fixtures: 24 seeded captains, scores 8–41, across 2 configKeys; local player never in fixtures.

As built (M5):
- Handlers (`mocks/handlers.ts`) run every request through one `serve()`: log it, ask the active scenario for a plan
  (`latencyMs` default 150, `failure` = network | timeout | status, `hangAfterCreate`), wait, fail or answer, log the result.
  A timeout waits 12 s and answers 504 without touching the database. Network errors are `HttpResponse.error()`.
- Scenarios (`mocks/scenarios.ts`): success · empty · manyPages · slow 2.5 s · jitter (seeded 100–2000 ms, same sequence after
  every reset) · outOfOrder (odd requests 3 s, even 300 ms) · timeout · networkError · http4xx (422) · http5xx (503) ·
  rankingFails (ranking and configs 503) · historyFails · timeoutAfterSave (only the PUT that **creates** a record hangs 12 s
  after storing it; the retry finds it and answers 200 at once) · downThenRecover (PUT 503 until the 3rd attempt since the
  scenario was selected or reset; GETs work). The counter is per page load.
- Datasets: `empty` starts with no records; `manyPages` adds seven battles of the local player (3 on `s120-i3`, 4 on `s180-i2`,
  generated at reset with the current player id and name) so History has 2 pages and Ranking 3; every other scenario uses the
  fixtures. Selecting a scenario whose dataset differs from the stored one resets the database (so `?scenario=empty` alone
  shows empty lists); otherwise switching keeps the records. `?reset=1` always resets (records + counters + request log).
- Fixtures (`mocks/fixtures.ts`): hand-written, deterministic ids and dates (29 Aug – 8 Sep 2026). `s120-i3`: 12 captains,
  Captain Flint 38, Red Sparrow 32, Storm Rider 21, Sea Wolf 19 … so a local 24 lands at 03 exactly like the mockup, with a
  duration tie (Iron Kate 15 in 88 s above Black Bart 15 in 120 s) and a date tie (Tide Runner above Gull Eye, both 12 in
  120 s). `s180-i2`: 12 captains, Calico Jack 41 … Captain Vane 8.
- `mocks/requestLog.ts` keeps the last 30 requests for the dev panel (and later `getRequestLog` in the test API).
- `app/startMsw.ts` applies `?scenario`/`?reset` before `worker.start`; on failure it sets `body[data-msw-offline]`, the data
  layer goes offline (§14) and every menu screen shows "Offline mode: ranking and history are unavailable. Battles still work
  and wait on this device."
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
animation and the render RNG (as built there is neither: the fog is a deterministic hash, so rendering needs no switch). Visual baselines: menu, arena after `advance(5000)` seed 42 no input, result after timeUp;
`maxDiffPixelRatio 0.005`; generated in the Playwright Docker image. `page.clock` for wall-clock waits (outbox backoff) in data specs only.
Reporter html + list, `trace: 'retain-on-failure'`. Vitest (6 suites, no others): comparator (M5, `data/contracts/ranking.test.ts`), validateOptions (M4), outbox reducer (M5, `data/outboxReducer.test.ts`), segment-circle (M2, `shared/math.test.ts`),
spawn entries (M1, `assets/parseTiledMap.test.ts`), **determinism** (M2, `session/determinism.test.ts`: same seed + scripted input
through `startLoop` + `ManualClock` gives an identical world for 1000 ms and 7 ms advances, and differs for another seed; added
because it caught a ManualClock bug, and verified to fail against the old code).

Per-spec map (hooks · scenario · seed): the D9 table of design session 6 (Quality), kept outside this repository; it is
inlined here in M6.

As built (M6):
- **Test API** (`src/testing/testApi.ts`, types in `src/testing/types.ts`): installed from `main.tsx` before MSW starts when the
  URL has `test=1`, as its own ≈ 2.6 kB chunk (never downloaded otherwise). It reaches the match through
  `session/testControl.ts`: `enable()`, a sticky seed and a sticky "next sessions use a `ManualClock`" flag read by `GameHost`, and
  the current session, which `GameSession` attaches on construction and detaches on dispose (store, clock, and read getters for
  the world and the state). `getSnapshot()` returns a frozen copy: state, time, score, timeLeftSec, ended/endReason, the player
  (position, heading, speed, turnVelocity, health, cooldowns per group), enemies, projectiles (faction, ownerId, position,
  direction, speed, consumed), effect count, spawns { count, nextAt }, config { sessionSeconds, spawnIntervalSec, configKey,
  seed, custom }. `getMap()` adds cols/rows/tile/size, the solid mask, the player start and the spawn entries.
  `waitForState` resolves from store and session subscriptions (no polling). `clearLocal()` removes `pb:v1:*` except the scenario.
  Nothing mutates combat (TEST-16).
- **Fixture** (`e2e/fixtures/pbPage.ts`, `pb`): `open(path, { scenario = 'success', reset = true })` → `path?test=1&scenario=…&reset=1`
  and waits for `body[data-msw-ready]` and the API; `startMatch({ seed = 42, options })` writes options, seeds, switches to the
  manual clock, clicks Play, waits for `ready` and steps once into `running`; `step`, `advance`, `hold(code, ms)`, `snapshot`,
  `map`, `state`, `waitForState`, `setScenario`, `resetServer`, `requestLog`, `clearLocal`, `setOptions`. Console guard: any
  `console.error`, page error or React warning fails the test unless that test allows the exact pattern (failure scenarios allow
  "Failed to load resource … 503", the asset spec allows `net::ERR_FAILED`).
- **Config**: projects `desktop` (Chromium 1280×720, DPR 1) and `mobile` (Pixel 7 user agent, 915×412 landscape, DPR 1, touch;
  runs test-01, test-09 and visual); timezone America/Sao_Paulo so dates are identical on every host; `reducedMotion: 'reduce'`;
  no retries; 4 workers locally, 2 in CI; list + HTML reporters; trace, video and screenshot kept on failure; the web server is
  `npm run build && npm run preview` (reused if already running locally). Baselines live in
  `e2e/__screenshots__/<spec>/<name>-<project>-<platform>.png` (`maxDiffPixelRatio 0.005`, animations disabled), so the Windows
  set and the Linux set (Docker/CI) sit side by side.
- **Docker / CI**: `npm run test:e2e:docker` (`scripts/e2e-docker.ts`) runs the suite in `mcr.microsoft.com/playwright:v<installed
  version>-noble` with `node_modules` in a named volume and `CI=1` (it builds and serves its own preview); add
  `-- --update-snapshots` to regenerate the Linux baselines. `.github/workflows/e2e.yml` runs lint, typecheck, Vitest and
  Playwright in the same image and uploads the HTML report (the repository has no remote yet).
- **Written in parallel**: the lead wrote the harness, TEST-01 and the visual spec; three agents wrote TEST-03–06, TEST-02/07/08/09
  and TEST-10–12 against one shared build, each owning its files; the lead reviewed and integrated them.

| ID | Spec · what it proves | Hooks | Scenario · seed | Projects |
| --- | --- | --- | --- | --- |
| TEST-01 | `test-01-options`: −/+ stop at 60/180 and 1/10 (disabled at the edge); a typed 75 shows "Use steps of 10 seconds." with `aria-invalid` and is not saved; Save 90/5 survives a reload and the next match's snapshot has `s90-i5`; corrupt or invalid stored options fall back to 120/3 | startMatch, snapshot, localStorage | success · 42 | D + M |
| TEST-02 | `test-02-assets`: while `ships.json` is held (`context.route`) the bar is between 0 and 100 and there is no canvas, then ready → running; aborted → `assetError` panel with Retry/Main Menu, no canvas, no snapshot, unroute + Retry → the match runs; a second match in the same page makes zero asset requests | waitForState, context.route | success · 42 | D |
| TEST-03 | `test-03-movement`: speed follows min(speed, accel·t) and the distance along the heading, release coasts speed²/2·drag, turning ramps at turnAccel up to turnRate; at the top rim both hull circles stay inside on every step and the ship slides along it; at an island face no hull circle overlaps a solid tile and the ship slides along the coast | manual clock, snapshot, map | success · 42 | D |
| TEST-04 | `test-04-combat`: Space → 1 ball along the heading; Q/E → 3 parallel balls on the correct side; Space held 2 s → floor(2/cooldown)+1 balls; balls pass through an arriving Shooter; aimed fire sinks the Chaser (40 → 20 → sunk), score exactly 1 and still 1 two seconds later | manual clock, snapshot | success · 42 (3 s and 10 s spawns) | D |
| TEST-05 | `test-05-enemies`: spawns.count = floor(t/interval) and nextAt steps by the interval; the first two kinds differ (42: Chaser then Shooter; 7: Shooter then Chaser); a Chaser rams an idle player for exactly impactDamage, disappears, score unchanged; a Shooter stays ≤ attackRange with its mean distance inside [minRange, attackRange] (it dips up to one tile inside minRange while turning) and fires | manual clock, snapshot | success · 42, 7 | D |
| TEST-06 | `test-06-match-end`: still running at 59.9 s, ended `timeUp` after, 5 s more change nothing, "You survived the attack"; an idle player with 1 s spawns is sunk (`defeated`, "Your ship was sunk"); Play Again after a scoring defeat → time 0, score 0, full health, no enemies or balls, cooldowns 0 | manual clock, waitForState | success · 42 | D |
| TEST-07 | `test-07-pause`: P/P, Esc/Esc and P/Resume each freeze time, cooldowns and spawns for 5 s and resume (60 steps = 1 s); W held into a pause and D/Q pressed while paused stay inert until pressed again; window blur, a hidden tab (stays paused while hidden) and the HUD Pause button pause | manual clock, snapshot, synthetic blur / visibilitychange | success · 42 (60 s / 10 s) | D |
| TEST-08 | `test-08-result`: the Result matches the snapshot (score, 01:00, Time's up), status Saving → Saved with exactly one PUT 201; a reload and a fresh visit of /result show the same result from storage; Play Again gives a fresh match, Main Menu and Back never return to a finished match | manual clock, requestLog, localStorage | slow · 42 | D |
| TEST-09 | `test-09-navigation`: Pause → Main Menu mid-match records nothing; menu ↔ play 10× keeps ≤ 1 canvas and the window/document listeners return to the menu baseline (CDP `DOMDebugger`); Forward, a reload and a typed /play land on the menu; touch: two fingers on Sail forward + Broadside left move the ship and fire exactly 3 balls to port, releasing stops both | requestLog, CDP | success · 42 | D + M (touch on M) |
| TEST-10 | `test-10-log-tabs`: manyPages ranking pages checked cell by cell (★, You at 03 and 07, both tie-breaks), history 2 pages, a tab shown again refetches; empty messages with Play; rankingFails → skeleton, 503 ×3, alert + Retry, history still loads, Retry after switching to success shows rows; slow → skeleton and Loading…, paging dims and disables the arrows until the next page arrives | setScenario, requestLog | manyPages, empty, rankingFails, slow | D |
| TEST-11 | `test-11-save`: a finished match is PUT once (201), Saved, and both tabs go from empty to showing it; downThenRecover → pending with countdown and badge, the badge survives a reload, PUTs [503, 503, 201], one record, lastResult saved | manual clock, requestLog, localStorage | success, downThenRecover · 42 | D |
| TEST-12 | `test-12-resend`: timeoutAfterSave → Saving while the PUT hangs (the record is already stored), Not saved after the 8 s client timeout, Retry now → Saved, PUTs [201, 200], one history row; outOfOrder → the late page-1 refetch (#3) never replaces page 2 (#4) | requestLog | timeoutAfterSave, outOfOrder | D |
| TEST-14 | `visual`: menu; arena after 5 s with seed 42 and no input; Result after time-up (60 s / 10 s) | manual clock | success · 42 | D + M |

As built (M7): the time-up specs (visual result, TEST-06 time-up, TEST-08, TEST-11, TEST-12) start with `survivorSeed = 143`
(exported by the fixture), whose idle player reaches time-up with 50/100 after the Shooter retune (§8); TEST-06's "defeat with a
kill" holds the bow gun with seed 50 (scores 3 before sinking). The UI font is Nunito, self-hosted (§19), so both baseline sets
render the same typeface; the menu baseline masks the "Build <sha>" footer. `PB_BASE_URL=https://… npm run test:e2e` runs the
suite against a deployed URL (no local web server).
As built (after M7, first GitHub Actions run): hosted runners render with software WebGL, and the TEST-03 edge and island specs,
which snapshotted every tick with `step(1)` (one drawn frame per tick, ≈ 600 per test), timed out at 60 s. `trace(ticks)` now
snapshots after every tick of a single `advance` and draws once; the CI timeout is 180 s (60 s locally). Checked in the Linux
image capped at 1 CPU: the slowest spec takes 108 s.

38 tests; 48 runs across the two projects (the touch test is skipped on desktop). TEST-13 = the two projects, TEST-15 = seed +
manual clock, TEST-16 = the API above, TEST-17 = a fresh context per test plus `reset=1`, TEST-18 = HTML report + traces.
Notes from the agents for ARCHITECTURE.md §19 (not bugs): sliding along an island at a steep angle is slow because each step keeps
only the tangential share of the speed; a Shooter dips about 40 px inside minRange while it turns (rudder inertia); the ship settles
one step deeper in the edge band than `edgeBand·speed/edgePush` because the push is applied after the move.

## 18. Performance (PERF-01..04)

Loading: route-level code split (§3) keeps Pixi out of the first download; MSW's worker bundle (≈ 431 kB at M5, fixtures included) loads in parallel
before first render because the mocks must be up before any query (§16). Report both in REPORT.md.

`session/perfProbe.ts` enabled by `?perf=1`: per-frame dt ring buffer; per-second samples {fps, p95, ships, shots, fx, heapMB};
on end downloads JSON. `scripts/perf.spec.ts`: `vite preview`, session 180 s, spawn 1 s, bot on real keyboard, 3 min real time →
`docs/perf/REPORT.md` with machine, browser, DPR, viewport, config. Targets: mean ≥ 58 FPS, p95 ≤ 20 ms. Memory: 5 × (Play → 20 s → Menu)
with manual DevTools heap snapshots (automated CDP spec is stretch); pass = heap(cycle 5) ≤ heap(cycle 2) × 1.10.

As built (M7), written by one agent while the lead finished the Shooter aim, the font and the docs:
- **Probe** (`session/perfProbe.ts`): enabled from `main.tsx` by `?perf=1`; `GameSession.frame()` calls `perfProbe.frame(state,
  world, app)`, a boolean check when disabled. Frame time is the rAF timestamp (`document.timeline.currentTime`) into a
  preallocated `Float32Array` (65 536 frames), counted only while `running`; one sample per second of play; on `ended` it
  downloads `{ meta (UA, DPR, viewport, canvas, renderer, GPU string, commit), config, summary (mean FPS, p50/p95/p99/max,
  frames > 20/33 ms, entity peaks, heap), samples }`.
- **Runs** (`npm run perf` → `scripts/perf.ts`): `playwright.perf.config.ts` builds into `dist-perf`, serves it on port 4174 and
  drives headed Chromium at 1920×1080, DPR 1 (real GPU; `PERF_HEADLESS=1` for headless). `scripts/memory.spec.ts` (the stretch
  #7 CDP spec, automated): 5 × Menu → Play → 20 s of sailing and firing → Pause → Main Menu, forced GC ×2, `Runtime.getHeapUsage`
  + `Performance.getMetrics` (DOM nodes, listeners) + canvas count. `scripts/perf.spec.ts`: production mode (no hooks), 180 s /
  1 s spawns, a dev-balance override of the player's health (so the ship lasts the whole match; the run is `custom`), a keyboard
  bot pressing real keys for 3 min. `scripts/perf-report.ts` renders `docs/perf/REPORT.md` from the two JSON files, the machine,
  the bundle sizes and `docs/perf/notes.md`.
- **Results** on the reference machine (Ryzen 9 5900X, Radeon RX 9060 XT, 240 Hz display, Chromium 153): mean 239.98 FPS
  (vsync-bound), p95 4.3 ms, max 12.5 ms, 0 frames > 20 ms, peak 7 ships / 9 balls / 10 effects; memory 7.98 → 8.62 MB from
  cycle 2 to 5 (limit 8.78 MB, PASS) with DOM nodes, listeners and canvases flat. A 10-cycle diagnostic with heap snapshots
  (`docs/perf/memory-diagnosis.json`) attributes ≈ 1.07 of the 1.14 MB growth to V8 compiled code and feedback, not app state.

## 19. Accessibility (A11Y-05/06)

Canvas `role="img" aria-label="Battle arena"`. HUD: `<output aria-label="Score">`, `<time>`, health `role="meter"`.
One `aria-live="polite"` region: score change, time at 60/30/10 s, health crossing 50/25 %, paused/resumed/ended; ≥ 1 s apart.
As built: `ui/a11y/useMatchAnnouncer` diffs consecutive HUD snapshots, queues messages and writes them into the region's text
directly (joined, at most one write per second; a repeated identical text gets a trailing no-break space so it is re-read), so
announcements cause no React re-render. The end banner is `aria-hidden` because the region announces the end with the score.
Every screen focuses its `<h1>` (`tabIndex=-1`) on arrival. HUD flash on `playerHit` (skipped under reduced motion); the
health bar also shows "76 / 100" as in `sample.png`.
Dialogs = native `<dialog>` + `showModal()` through one `GameDialog` (wood panel, title, actions); `cancel` event → resume on
Pause and is ignored on Result (if the browser closes a dialog on its own, e.g. a non-cancelable Esc, it reopens while still
wanted); focus returns to opener. Tab may leave the dialog for the browser toolbar (native modal behaviour, no keyboard trap).
The focused button inside a dialog always shows the ring (`:focus`, not `:focus-visible`): Chrome did not treat a keyboard P/Esc
pause as keyboard modality, so the ring appeared only after Tab (found at M3). Real `<button>`s with sprite
backgrounds; `:focus-visible` 3 px cream outline offset 3 px. Options: `role="group"`, `<output>` value, visible limits text,
errors `role="alert"` + `aria-describedby`. Tables: `<th scope>`, YOU row `aria-current`. `prefers-reduced-motion` disables HUD flash.
Contrast: cream #F3E9D2 on navy #243447 ≈ 10.5:1; dark #1F2A38 on gold #E0B95A ≈ 7.9:1; DEFEATED tint #F08A7A.
As built (M7): the UI font is Nunito (variable, weights 200–1000, SIL OFL 1.1), self-hosted as a 39 kB Latin-subset woff2 in
`src/app/fonts/` (with its `OFL.txt`), hashed into `/static/`, preloaded from `index.html`, `font-display: swap`; every
`system-ui` stack now starts with it. Glyphs outside the subset (★, ← →) fall back to the system font. Checked for clipping at
640×360, 915×412 and 1280×720.

## 20. Milestones (two days, 24 h committed + 4 h buffer)

| # | Hours | Scope | Done when |
| --- | --- | --- | --- |
| M0 | 1.5 | Vite/React/TS strict, layer folders + lint boundaries, Playwright/Vitest installed, MSW worker file, Dockerfile + nginx.conf + compose | Local Docker image verified on `localhost:8080`: extensionless paths fall back to the app, `/result` reload works, `mockServiceWorker.js` returns 200 as JavaScript with `no-cache`, a missing asset is a 404, `/static/*` is immutable, `body[data-msw-ready]` set, console clean. Public deploy is deferred to CP1 |
| M1 | 4 | Atlas conversion, tile probe, Tiled map + loader, ensureLoaded with progress/error, GameSession skeleton (Strict-Mode-safe), static tiles, one ship, sea beyond the arena (no bars)/DPR | Arena renders on desktop + phone; mount/unmount/mount leaves one canvas, zero listeners |
| M2 | 6 (4.5 + 1.5 of the day-1 buffer) | GameConfig, world/step, movement with accel/drag + collide-and-slide, islands + soft edge, open-sea fog (thickening to opaque beyond the rim), cannons array with cooldowns, swept shots, damage/scoring, border entries with arrival state, Chaser/Shooter AI, keyboard, over-ship bars, damage stages, explosion + wreck | Full keyboard match playable; enemies sail in through the fog; seeded run repeats under ManualClock |
| M3 | 2 | Lifecycle, pause/auto-pause/resume, store + HUD, Pause dialog, minimal Result, abandon on route change (loop, RealClock, ManualClock and keyboard input with clear-on-blur already landed in M2). As built it also pulled the UI sprites and the `WoodPanel` / `GoldButton` / `RoundButton` primitives forward from M4, because the HUD, Pause dialog and Result use the pack's art | HUD updates on change only; blur pauses; held keys don't leak; Play Again resets |
| CP1 | h14 | Day-1 buffer: 0.5 h left after M2's planned 1.5 h → M2 overrun first; stretch #1–2 move to day 2's buffer. If M2 runs long, cut in this order: fog gradient → plain darker band; arrival → fade-in at the entry; acceleration and slide stay. Public deploy: homelab clone, `docker compose up -d --build`, Caddy site `reverse_proxy` to the container on the subdomain | M0–M3 deployed over HTTPS on the subdomain: `mockServiceWorker.js` 200 as JavaScript with `no-cache`; `/result` loads directly and on reload; `document.body.dataset.mswReady === "true"`; footer SHA = `git rev-parse --short HEAD` |
| M4 | 3.5 | Remaining primitives (Tabs, steppers), Menu (controls table), Options (steppers, validate, Save), Captain's Log shell (6 states), touch layer + sweep, portrait overlay, loading/error screens, dialogs, live region, focus. As built: player name editing on the Menu (moved here from M5); the Result save-status row moved to M5 (it needs the outbox); the Log renders its empty state until M5 feeds it | All screens usable by keyboard and touch; no clipping at 640×360 |
| M5 | 3 | Contracts, Axios, queries, outbox, storage codec (options/player part landed in M4), Result save-status row (moved from M4), handlers, fakeDb, comparator, 14 scenarios, fixtures, dev panel (network + JSON balance), worker before render, custom flag. As built also: offline banner, the menu pending badge, 409 on a changed body, server-side custom check, a two-column Log on short screens | Deployed: match → rows in both tabs; timeoutAfterSave → one row after Retry; pending badge survives reload |
| CP2 | h20.5 | If behind: M6 keeps 3.5 h, M7 shrinks to 1.5 h | Manual pass of every TEST-ID on the deployed build |
| M6 | 3.5 | Test API, pbPage fixture, 12 spec files (order 01,03,04,06,07 → 02,05,08,09 → 10,11,12), 6 baselines, report + traces committed. As built: specs written in parallel by three agents on the lead's harness; ManualClock draws once per advance; loading panel delayed 150 ms; Windows and Linux baselines; Docker runner + CI workflow | `test:e2e` green twice locally, once in CI (no remote yet: the Docker run of the same image stands in until the repository is pushed) |
| M7 | 2 | Perf run, memory check, REPORT.md, README, ARCHITECTURE.md (outline §21), licenses, tagged deploy. As built: Shooter aim retuned (stretch #2, §8) and self-hosted Nunito (§19) first, because both change seeded outcomes and baselines; perf probe + automated perf and memory specs (stretch #7, §18) written by one agent, README + licenses and ARCHITECTURE.md drafted by two more, all reviewed by the lead; `PB_BASE_URL` runs the suite against a deployed URL | Clean clone runs dev/build/preview/lint/typecheck/test:e2e (checked on a copy of exactly the commit's files: npm ci, lint, typecheck, 29 Vitest, build, preview and dev answer, 47 passed / 1 skipped); `test:e2e` green twice on Windows and once in the Linux image; deployed SHA = tag (deploy and tag by the author) |

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
| Enemies stuck on islands | Mitigated at M2: rectangular islands, ≥ 3-tile lanes, island-corner detours when line of sight is blocked, stuck rule, separation (measured, §8) | flow field BFS (1.5 h), no longer expected to be needed |
| Flaky visual baselines | Docker image, self-hosted font, fonts.ready, ambient off, seed 42 | mask arena; maxDiffPixelRatio 0.02 |
| Tile index assumption | Closed at M1: index layout read from the sheet with a labelled contact sheet; map preview matched in-game render | — |
| M2 overrun | D5 order, tiny Vitest per system, CP1 gate | day-1 buffer; Shooter stays front-only |
| iOS touch quirks | pointer capture, touch-action none, 100dvh, portrait overlay | document Chromium-mobile as tested target |
| Late responses leak | signal is a required param of every api fn; TEST-12 | serverTime compare in structuralSharing |
| Service worker timing in tests | render after worker.start(); fixture waits for data-msw-ready | context.route holds /api/** until ready (page.route cannot see worker traffic) |
| Sticky keys | clear() on pause/blur/hidden/resume/dispose; TEST-07 | clear on unknown keyup |
| < 60 FPS at DPR 2 | static tiles, atlases, pools, cap 12 (as built: 6 alive) | resolution min(dpr, 2); bars redraw on change; document |

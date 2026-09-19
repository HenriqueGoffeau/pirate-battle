# Pirate Battle

A single-player, top-down naval shooter that runs entirely in the browser. You sail between islands, fight Chaser
and Shooter ships that sail in out of the fog, and score one point for every ship your cannons sink before the timer
runs out or your ship goes down. React 19 draws the menus, dialogs and HUD; PixiJS 8 draws the arena; movement,
combat, collision and enemy AI are hand-written rules in a pure TypeScript simulation. Ranking and match history go
through a REST API mocked with MSW at the network layer, called with Axios and cached with TanStack Query. Playwright
covers every graded flow end to end, including visual regression.

**Live URL:** <LIVE_URL>

**Hosting choice.** The game is deployed as a self-hosted Docker image (nginx serving the static build) behind the
author's Caddy reverse proxy on a dedicated subdomain, over HTTPS with a trusted certificate. This replaces Vercel,
Netlify or Cloudflare Pages, which the challenge names. The live container is built from this repository's
`Dockerfile` and `nginx.conf`, the same ones used for the local check on `localhost:8080`. That `nginx.conf` holds
the SPA fallback and the cache rules the MSW service worker depends on. See [Deploy](#deploy).

Related documents: [ARCHITECTURE.md](ARCHITECTURE.md) (design and decisions) ·
[PIRATE_BATTLE_DESIGN_BRIEF.md](PIRATE_BATTLE_DESIGN_BRIEF.md) (the requirement IDs such as `GP-03` or `API-11` used
below) · [docs/CHALLENGE.md](docs/CHALLENGE.md) (the original challenge statement, in Portuguese) ·
[docs/perf/REPORT.md](docs/perf/REPORT.md) · [docs/licenses.md](docs/licenses.md).

## Contents

- [Estimate and cuts](#estimate-and-cuts)
- [Setup and scripts](#setup-and-scripts)
- [Deploy](#deploy)
- [Environment variables](#environment-variables)
- [Controls](#controls)
- [Gameplay configuration](#gameplay-configuration)
- [Network scenarios](#network-scenarios)
- [Tests](#tests)
- [Performance](#performance)
- [Architecture and limitations](#architecture-and-limitations)
- [Assets and licenses](#assets-and-licenses)

## Estimate and cuts

Estimate given before starting:

> Two days (≈ 28 h): day 1 playable core + Pixi lifecycle on the public URL; day 2 screens, ranking/history with
> mocks, Playwright, profiling, docs.

The plan was 24 committed hours plus a 4-hour buffer, split into milestones M0–M7 with one commit per milestone
(`git log --oneline`). The buffer went to stretch items only, in a fixed order. These were cut or left as stretch:

| Item | State |
| --- | --- |
| Shooter side cannons (stretch #1) | Not built. Shooters carry one bow cannon. Cannons are a per-kind array in `GameConfig`, so side cannons would be config entries, but they were never added or tuned. |
| Resume countdown (stretch #5) | Not built. Resume (button, P or Esc) is immediate. Held keys still have to be pressed again (MR-10). |
| Sinking debris and crew (stretch #6) | Not built. A destroyed ship explodes and leaves a fading wreck sprite. |
| Mobile Playwright project | Limited to TEST-01, TEST-09 and the visual spec. The stretch goal also covered TEST-08 and TEST-10. |
| Not planned | Audio (the pack's WAV files are unused), a ranking configuration selector (the `GET /api/ranking/configs` endpoint exists but has no UI), balance editing as form fields (the dev panel edits JSON), render interpolation. |

## Setup and scripts

Requirements:

- Node.js ≥ 22 (`engines` in `package.json`). Node 24 is what the Docker build uses. The `scripts/*.ts` files are
  run directly by Node, which requires type stripping to be on by default (Node 22.18+ or 23.6+).
- Chromium for Playwright, installed once with `npx playwright install chromium`.
- Docker, only for the container and for `npm run test:e2e:docker`.

```bash
npm ci
npm run dev          # http://localhost:5173
```

The commands are the same in PowerShell and bash. MSW starts before the first render, so ranking and history work
from the first screen. Add `?dev=1` to any URL to show the dev tools (see [Gameplay configuration](#gameplay-configuration)).

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with React Strict Mode, at http://localhost:5173 |
| `npm run build` | `tsc -b` then `vite build` into `dist/`. Hashed bundles go to `dist/static/` |
| `npm run preview` | Serves `dist/` at http://localhost:4173 (the optimized build) |
| `npm run lint` | ESLint, including the layer boundaries (`eslint-plugin-boundaries`: `src/sim` may import only `config` and `shared`, with no `pixi.js`, React or DOM globals) |
| `npm run typecheck` | `tsc -b` (TypeScript strict) |
| `npm test` | Vitest, 6 suites (see [Tests](#tests)) |
| `npm run test:e2e` | Playwright, both projects. Builds and serves the app itself |
| `npm run test:e2e:docker` | The same suite inside the official Playwright Linux image (Docker required) |
| `npm run perf` | 5-cycle memory check plus a 3-minute FPS run on the optimized build (headed Chromium, 1920×1080, port 4174; about 5 minutes). Writes `docs/perf/*.json` and `docs/perf/REPORT.md` |
| `npm run perf:report` | Re-renders `docs/perf/REPORT.md` from the JSON files and `docs/perf/notes.md` without a new run |
| `npm run convert-assets` | Converts the source pack in `assets/`: the ships atlas from Sparrow XML to Pixi JSON, the tile grid to JSON (1× and 2×), the UI sprites copied to `src/ui/sprites/`. Then it rebuilds the map |
| `npm run map:watch` | Rebuilds `public/maps/archipelago-1.json` every time `scripts/maps/archipelago-1.txt` is saved |

The output of `convert-assets` is committed, so a clean checkout builds without running it.

**Editing the map.** The arena is authored as text in `scripts/maps/archipelago-1.txt`, a 24×14 grid. `.` is water,
`s`/`g` are sand and grass island cells, `S`/`G` are island cells with a decoration, `P` is the player start, and
`0`–`9` are enemy entry points on the border (never on a corner). Run `npm run dev` and `npm run map:watch` side by
side, then open http://localhost:5173/play?dev=1. Every time you save the text file, the page reloads with the new
map and a debug overlay (grid, solid cells, entries, player start, edge band). A layout that breaks a rule is not
written; the watcher prints the rule and the cell instead. The rules are: sand islands 3×3, grass islands 4×4, and at
least 3 tiles of water between islands and to the edge.

## Deploy

The image has two stages: `node:24-alpine` runs `npm ci` and `npm run build`, then `nginx:1.30-alpine` serves
`dist/` on plain HTTP port 8080, with a health check. `docker-compose.yml` defines one service (container
`pirate-battle`, `restart: unless-stopped`).

```bash
VITE_COMMIT_SHA=$(git rev-parse --short HEAD) docker compose up -d --build
```

```powershell
$env:VITE_COMMIT_SHA = git rev-parse --short HEAD; docker compose up -d --build
```

The image is tagged `pirate-battle:<sha>`, and the menu footer shows `Build <sha>`, so you can check that the live
site matches a commit. To update the server, run `git pull` and the same command again. Open http://localhost:8080
to check the container locally. `localhost` counts as a secure context, so the mocks run there over plain HTTP.

What `nginx.conf` does:

| Path | Response |
| --- | --- |
| Extensionless (`/`, `/play`, `/result`, `/log`, …) | The file if it exists, otherwise `index.html` (SPA fallback), `Cache-Control: no-cache` |
| Any path with a file extension | The file or a real 404, never the HTML page, `Cache-Control: no-cache` (this includes `mockServiceWorker.js`, `/assets/*` and `/maps/*`) |
| `/static/*` (hashed bundles) | `Cache-Control: public, max-age=31536000, immutable` |

Requirements for the reverse proxy in front:

- **HTTPS with a trusted certificate.** MSW runs in a service worker, and browsers register service workers only in
  a secure context. On a plain-HTTP LAN address the app falls back to offline mode: battles work, but ranking and
  history are unavailable.
- **Serve the app at the root of its own (sub)domain.** No Vite `base`, router `basename` or worker scope is
  configured for a sub-path.
- **Pass requests and response headers through unchanged.** Do not rewrite `mockServiceWorker.js` or asset URLs to
  `index.html`, and do not add a SPA fallback of your own; nginx already falls back only for extensionless paths.
  `mockServiceWorker.js` must keep `no-cache`, so a redeploy is never hidden behind a stale worker.

A minimal Caddy site (Caddy obtains the certificate itself):

```
pirate-battle.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

To check a deploy:

- `curl -I <LIVE_URL>/mockServiceWorker.js` should answer 200 with a JavaScript content type and `cache-control: no-cache`.
- `<LIVE_URL>/result` should load when opened directly and again after a reload.
- In the DevTools console, `document.body.dataset.mswReady` should be `"true"`.
- The footer SHA should equal `git rev-parse --short HEAD`.

## Environment variables

The app has no `.env` file and no runtime configuration. Only these variables are read:

| Variable | Read by | Effect |
| --- | --- | --- |
| `VITE_COMMIT_SHA` | Build time only (Docker build arg via compose; a local `npm run build` also picks it up) | Shown in the menu footer as `Build <sha>`. Unset: `dev` from Vite, `unknown` from the Docker build |
| `PB_PORT` | `docker compose` | Host port for the container (default `8080`) |
| `PB_BASE_URL` | Playwright | Runs the suite against an already deployed URL instead of building and serving a local preview |
| `CI` | Playwright | Set by CI runners and by `test:e2e:docker`: 2 workers instead of 4, `test.only` forbidden, never reuses a running preview |

To run the suite against the live site:

```powershell
$env:PB_BASE_URL = '<LIVE_URL>'; npm run test:e2e; Remove-Item Env:PB_BASE_URL
```

```bash
PB_BASE_URL=<LIVE_URL> npm run test:e2e
```

## Controls

The keys are matched by `event.code` (physical position, independent of keyboard layout) and captured only while a
match is running (A11Y-07). There is no remapping. The Main Menu builds its controls table from the same
`src/shared/bindings.ts`.

| Action | Keys |
| --- | --- |
| Sail forward | W, ↑ |
| Turn left | A, ← |
| Turn right | D, → |
| Fire bow cannon | Space |
| Broadside left | Q |
| Broadside right | E |
| Pause / resume | P, Esc |

- Hold a fire key to keep firing at the cannon's cooldown rate: bow 0.6 s, broadsides 1.4 s (three parallel balls).
  Moving, turning and firing work at the same time (GP-07). There is no reverse; releasing forward lets the ship coast.
- Keys combined with Ctrl, Meta or Alt are left to the browser.

**Touch** (shown only on coarse pointers, landscape). The bottom-left cluster steers: Sail forward on top, Turn left
and Turn right below it. The bottom-right cluster fires: Fire bow cannon on top, Broadside left and Broadside right
below it. Each button tracks its own finger, so several can be held at once. A sweep on the cannon buttons shows the
cooldown. The HUD pause button sits at the top.

**Pause.** Press P or Esc, or the HUD pause button. The game also pauses by itself when the window loses focus, the
tab is hidden, or a touch device turns to portrait (a rotate overlay replaces the dialog; menus work in portrait).
While paused, time, cooldowns and spawns are frozen. Resume with the Resume button, P or Esc. A key or finger held
through a pause does nothing until it is pressed again. The pause dialog offers Resume and Main Menu. Leaving
abandons the match, which is never recorded (CFG-06).

**Rules in brief.** Health is 100, with no regeneration and no pickups. A Chaser (red sails) is slower than you but
rams for 30 and explodes; that scores nothing. A Shooter (blue sails) keeps its distance and fires its bow cannon. The
first two spawns are one of each kind, and at most 6 enemies are alive at once. The match ends when time runs out
(a win) or your health reaches zero.

## Gameplay configuration

**Options screen** (exactly two settings, CFG-03):

| Setting | Range | Step | Default |
| --- | --- | --- | --- |
| Game session time | 60–180 s | 10 | 120 |
| Enemy spawn time (interval) | 1–10 s | 1 | 3 |

- The −/+ buttons snap to the step and are disabled at the limits.
- The value can also be typed. An out-of-range, off-step (for example 75), fractional or non-numeric value shows an
  accessible error and is not saved.
- Save writes `pb:v1:options` and applies from the next battle. Stored values that fail validation fall back to the
  defaults.
- Each match takes a frozen snapshot of the configuration at start (CFG-05).

**configKey and ranking.** Every record carries `configKey = s{sessionSeconds}-i{spawnIntervalSec}`, for example
`s120-i3` for the defaults.

- The Ranking tab compares only matches with the key of your current Options (API-03). The tie-break is score DESC,
  then effective seconds ASC, then `playedAt` ASC, then `matchId` ASC. Pages hold 5 rows.
- Fixtures (24 captains) exist only for `s120-i3` and `s180-i2`. Any other configuration starts with an empty
  ranking until you play it.
- Match History shows all of your matches, newest first. Your captain name (Main Menu, pencil button, default
  "Captain Jack") is what the ranking shows.

**Balance.** Every other gameplay number lives in the one typed, frozen `GameConfig` in `src/config/gameConfig.ts`:
health, speeds, acceleration, drag, turn rates, each cannon's damage, speed, range and cooldown, Shooter ranges and
aim, spawn weights, cap and minimum distances, AI and effect timings. The systems only read it, so rebalancing never
touches code (CFG-01/02).

**Dev panel.** Add `?dev=1` to any URL once to turn dev mode on (it is stored in `pb:v1:dev`; `?dev=0` turns it off).
A **Dev tools** pill then appears at the top left of every menu screen. It opens a dialog with two tabs:

- **Network**:
  - A scenario select with the scenario's description.
  - **Reset server**, which restores the scenario's starting records and counters.
  - **Clear outbox**.
  - Outbox counts (waiting and failed) and the last 8 mock requests (method, path, status, ms).
  - Changing the scenario or resetting refetches every open query.
- **Balance**: the `GameConfig` as JSON. **Apply** validates the JSON and its shape (same keys and types, finite
  numbers; the error names the path, for example `arena.mapId must be text.`), stores it in `pb:v1:devBalance` and
  uses it from the next battle. **Reset** returns to the default.

**Custom rule.** A match whose balance differs from the default `GameConfig` in any value is recorded with
`custom: true`:

- It is still saved. Match History shows it with a **CUSTOM** tag, and the Result dialog adds "Custom balance · not
  ranked".
- The ranking leaves it out (the configs summary too), so a leaderboard only compares matches played under the
  same rules.
- The mock server recomputes the flag from the record's config and answers 422 when it does not match, so a custom
  match cannot be sent as a ranked one.
- A custom balance applies only while dev mode is on. Applying a balance equal to the default simply clears it, and
  **Exit dev mode** in the panel returns to the default balance.

## Network scenarios

The mocks are the same MSW handlers, fixtures and contracts in development, tests and the live deploy (MSW-01/06).
There are 14 scenarios, defined in `src/mocks/scenarios.ts`. Every request waits 150 ms unless the scenario says
otherwise.

**Selecting.** Use the dev panel's Network tab, or add `?scenario=<id>` to any URL, for example
`/log?scenario=manyPages`. The choice is stored in `pb:v1:scenario` and stays active across reloads until you choose
another one. Tests call `window.__PB_TEST__.setScenario(id)`.

**Resetting.** Use **Reset server** in the dev panel, or add `&reset=1` to the URL (for example
`/?scenario=success&reset=1`). A reset restores the scenario's starting records, zeroes its request counters and
clears the request log. Switching to or from `empty` or `manyPages` resets the records by itself, because those
scenarios bring their own datasets.

**Where the data lives.** The fake server's database is `pb:v1:mockDb` in localStorage (`{ dataset, records }`, the
newest 500 records kept). It is kept separate from the client's outbox of unsent records, `pb:v1:outbox`.

To finish a match quickly for the save scenarios, set the session to 60 s and the spawn interval to 1 s. An idle
ship sinks well before the timer ends.

| Scenario | Try this | What you'll see |
| --- | --- | --- |
| `success` | `/log?scenario=success&reset=1`, then play a match | Ranking `s120-i3`: Captain Flint 38 at 01 … 12 captains. After a match, "Saved to the captain's log" and your row in both tabs |
| `empty` | `/log?scenario=empty` | "No battles logged yet for this configuration." with a Play button; History says "No battles logged yet." |
| `manyPages` | `/log?scenario=manyPages` | Seven of your own battles added. With the default Options, Ranking has 3 pages with your YOU rows at 03 and 07; History has 2 pages |
| `slow` | `/log?scenario=slow`, then page through | Every request takes 2.5 s: 5 skeleton rows and "Loading…" first, then dimmed rows and disabled arrows until the next page arrives. A save shows "Saving…" for about 2.5 s |
| `jitter` | `/log?scenario=jitter&reset=1`, then page through | Seeded latency between 100 and 2000 ms (see the times in the dev panel). The same sequence comes back after every reset (MSW-05) |
| `outOfOrder` | `/log?scenario=outOfOrder`, then page and switch tabs quickly | Odd requests take 3 s and even ones 300 ms, so older answers arrive after newer ones. A late answer never replaces the page on screen (API-09; TEST-12 scripts the exact order) |
| `timeout` | `/log?scenario=timeout` | Every request hangs 12 s and the client gives up at 8 s. After two retries (about 27 s) the tab shows the error with Retry. A save stays "Not saved yet · retry in N s" with the menu badge |
| `networkError` | `/log?scenario=networkError` | Connection errors: after two quick retries, "Couldn't reach the server." with Retry. Saves wait in the outbox with a countdown and the badge |
| `http4xx` | `/log?scenario=http4xx`, then play a match | 422 on every request. Reads fail at once (not retryable). A save fails permanently: "Couldn't save: The request was rejected as invalid.", with no automatic retry and no badge |
| `http5xx` | `/log?scenario=http5xx`, then play a match | 503 on every request. Reads retry twice, then show the error with Retry. Saves back off 2, 4, 8 … s (capped at 30 s) until the scenario changes |
| `rankingFails` | `/log?scenario=rankingFails` | Ranking: skeleton, 3 × 503, then an alert with Retry. History and saving work |
| `historyFails` | `/log?tab=history&scenario=historyFails` | History fails the same way. Ranking and saving work |
| `timeoutAfterSave` | `/?scenario=timeoutAfterSave`, then play a match | The PUT stores the record, then its answer hangs 12 s. "Saving…" turns into "Not saved yet" at 8 s. The automatic retry or **Retry now** gets 200 with the stored record, then "Saved". PUTs are [201, 200] and there is one History row (MSW-03e, API-11) |
| `downThenRecover` | `/?scenario=downThenRecover`, then play a match | Saving answers 503 until the third attempt (the count restarts when the scenario is selected, reset or the page reloads). PUTs are [503, 503, 201]. The badge on Match History survives a reload until the save goes through (MSW-03f, API-12) |

**Offline mode.** If the service worker cannot start (no secure context, or blocked by the browser), every menu
screen shows "Offline mode: ranking and history are unavailable. Battles still work and wait on this device."
Finished matches stay in the outbox and are sent on the next boot with the mocks.

**Local storage keys** (all versioned `pb:v1:*` and validated on read; a bad value falls back to a default):

| Key | Contents |
| --- | --- |
| `pb:v1:options` | The two Options |
| `pb:v1:player` | `playerId` (UUID) and captain name |
| `pb:v1:lastResult` | The last finished match and its save status (what `/result` shows after a reload) |
| `pb:v1:outbox` | Records waiting to be sent |
| `pb:v1:mockDb` | The fake server's database |
| `pb:v1:scenario` | The active scenario |
| `pb:v1:dev` | Dev mode on |
| `pb:v1:devBalance` | The custom balance from the dev panel |

To start from scratch, delete the `pb:v1:*` keys in DevTools under Application → Local Storage.

## Tests

**Vitest** (`npm test`) runs 6 small suites on pure logic:

| Suite | Covers |
| --- | --- |
| `src/data/contracts/ranking.test.ts` | Ranking comparator and tie-break |
| `src/config/userOptions.test.ts` | `validateOptions` (range, step, fractions, non-numbers) |
| `src/data/outboxReducer.test.ts` | Outbox state machine (enqueue once, backoff, permanent failure, reload) |
| `src/shared/math.test.ts` | Swept segment vs circle (projectile hits) |
| `src/assets/parseTiledMap.test.ts` | Spawn entries: on the edge, facing inward, with a clear water lane to the player start |
| `src/session/determinism.test.ts` | Same seed + scripted input gives an identical world under 1000 ms and 7 ms clock advances, and a different one for another seed |

**Playwright** (`npm run test:e2e`) has 38 tests and 48 runs in two Chromium projects:

- `desktop`: 1280×720, DPR 1.
- `mobile`: Pixel 7, 915×412 landscape, touch. Runs TEST-01, TEST-09 and the visual spec.

Playwright builds the app and serves `vite preview` on port 4173 itself, so the suite always runs against the
optimized build. Locally it reuses a preview that is already running. Each test starts from a fresh browser context
with `?test=1&scenario=…&reset=1` (TEST-17). A fixture fails any test that logs a console error or a React warning
(C-08). The timezone is fixed (America/Sao_Paulo) so dates render the same everywhere.

| Spec (`e2e/specs/`) | Proves |
| --- | --- |
| `test-01-options` | Steppers stop at the limits, 75 is rejected with an accessible error, saved options survive a reload and reach the next match's `configKey`, corrupt storage falls back to 120/3 |
| `test-02-assets` | Loading progress with no canvas, a failed atlas shows an error with Retry, Retry recovers, a second match makes no asset requests |
| `test-03-movement` | Acceleration, coasting, rudder inertia, sliding along the arena rim and island coasts without overlap |
| `test-04-combat` | Bow and broadside shots on real keys, cooldown count, damage, exactly one point per sunk ship |
| `test-05-enemies` | Spawn count and timing, the first two kinds differ, Chaser ram damage with no score, Shooter range and fire |
| `test-06-match-end` | Time up and defeat, the simulation stops, Play Again is a clean new match |
| `test-07-pause` | P, Esc, the HUD button, blur and a hidden tab freeze time, cooldowns and spawns; held keys stay inert after resume |
| `test-08-result` | Result matches the match, Saving → Saved with one PUT, survives a reload and a fresh visit, Back never returns to a finished match |
| `test-09-navigation` | Abandoning records nothing, 10 menu ↔ play cycles keep ≤ 1 canvas and no leaked listeners, reloads land on the menu, multi-touch controls |
| `test-10-log-tabs` | Ranking and History paging, both tie-breaks, empty, error with Retry, loading and placeholder states |
| `test-11-save` | One PUT per match, both tabs refresh, a pending save and its badge survive a reload and recover |
| `test-12-resend` | A retry after a timeout returns the stored record (no duplicate), and late responses never overwrite newer pages |
| `visual` | Menu, arena after 5 s (seeded, no input) and Result, on desktop and mobile |

**In Docker** (Linux, as in CI): `npm run test:e2e:docker` runs the same suite in
`mcr.microsoft.com/playwright:v<installed version>-noble`, with `node_modules` kept in a named Docker volume.
Arguments after `--` go to `playwright test`. `.github/workflows/e2e.yml` runs lint, typecheck, Vitest and
Playwright in the same image and uploads the HTML report.

**Visual baselines** live in `e2e/__screenshots__/visual.spec.ts/<name>-<project>-<platform>.png`, with a `win32` set
and a `linux` set side by side (`maxDiffPixelRatio 0.005`). To update them:

- Windows: `npm run test:e2e -- --update-snapshots`
- Linux (Docker, the set CI compares against): `npm run test:e2e:docker -- --update-snapshots`

No macOS set is committed, so on macOS use the Docker command.

**Against a deployed URL:** set `PB_BASE_URL` (see [Environment variables](#environment-variables)). Nothing is
built or served locally.

**Reports.** The HTML report is written to `playwright-report/` (open it with `npx playwright show-report`). The
committed copy for the delivery is [docs/reports/playwright/index.html](docs/reports/playwright/index.html). When a
test fails, its trace, video and screenshot are kept under `test-results/` and linked from the report (TEST-18).

### How to reproduce a failure

1. **Re-run the one test** and watch it:
   `npx playwright test e2e/specs/test-04-combat.spec.ts --project=desktop --headed`. Use `--ui` or `--debug` to
   step through it.
2. **Open its trace**, which has the DOM snapshot, console and network at every step:
   `npx playwright show-trace test-results/<test-folder>/trace.zip`, or click the trace in the HTML report.
3. **Replay it by hand.** The spec names its scenario and seed. The fixture's default seed is 42; some specs use 7
   or `survivorSeed` (143, in `e2e/fixtures/pbPage.ts`). Combat is deterministic under a seed and the manual clock
   (the determinism suite proves it). Run `npm run build && npm run preview`, open
   http://localhost:4173/?test=1&scenario=success&reset=1, and in the DevTools console:

   ```js
   __PB_TEST__.setSeed(42)          // sticky for the next matches
   __PB_TEST__.useManualClock()     // time moves only when you advance it
   // click Play in the page
   await __PB_TEST__.waitForState('ready')
   __PB_TEST__.step(1)              // one 60 Hz tick: the match is now 'running'
   __PB_TEST__.advance(5000)        // 5 s of simulation
   __PB_TEST__.getSnapshot()        // state, time, score, player, enemies, projectiles, spawns, config
   ```

   Other hooks:

   | Hook | Returns or does |
   | --- | --- |
   | `getMap()` | Solid mask, entries, player start |
   | `getMatchState()` | The current match state |
   | `waitForState(state)` | Resolves when the match reaches that state |
   | `setScenario(id)` | Switches the network scenario |
   | `resetServer()` | Resets the fake server |
   | `getRequestLog()` | Every mock request with its status and time |
   | `clearLocal()` | Removes the `pb:v1:*` keys except the scenario |

   Keys pressed in the page are sampled on the next tick, which is what the fixture's `hold(code, ms)` does. Without
   `useManualClock()` the match runs in real time with the chosen seed, and `getSnapshot().config.seed` tells you
   the seed of any match played under `?test=1`.

The hooks exist only when the URL has `test=1`, and they load as a separate chunk that no normal visit downloads.
They read state and control the clock and the scenario. They cannot change combat: there is no `setHealth` or
`killEnemy`, and combat tests press the real keys (TEST-16). Rendering has no randomness of its own, and Playwright
runs with reduced motion, so screenshots are stable.

## Performance

- Evidence: [docs/perf/REPORT.md](docs/perf/REPORT.md). It records machine, browser, DPR, viewport, match
  configuration, results and the limitations observed.
- Run: `npm run perf`. It uses the optimized build: one 3-minute match for FPS, p95 frame time and entity counts
  (PERF-01/02), then 5 cycles of Play → play → Main Menu for memory (PERF-03). It rewrites the report.
- Targets: mean ≥ 58 FPS and p95 frame time ≤ 20 ms. For memory, the heap after cycle 5 must be ≤ the heap after
  cycle 2 × 1.10.
- Probe: `?perf=1` loads the frame-time probe (`src/session/perfProbe.ts`, a separate chunk). It records FPS, p95,
  ship, shot and effect counts, and JS heap per second, plus a summary at the end of the match.
- Loading: the route-level split keeps PixiJS out of the first download (the menu, Options and Captain's Log never
  load it). The mocks load before the first render because every query needs them. The report gives both sizes.

## Architecture and limitations

[ARCHITECTURE.md](ARCHITECTURE.md) covers the layers and their lint-enforced boundaries, the React ↔ PixiJS bridge,
the fixed-step simulation, collisions, enemy AI and spawning, the resource lifecycle under Strict Mode, local
persistence, and the ranking and history integration (contracts, cache, idempotent PUT, outbox). It ends with a
requirement ID → section index.

Main limitations (the full list is in ARCHITECTURE.md §19, "Limitations and future work"):

- **No render interpolation.** The simulation steps at a fixed 60 Hz and the frame shows the latest step, so a
  120 Hz display gets no smoother motion.
- **Enemy avoidance is local** (feelers, separation and island-corner detours), not pathfinding. It is enough
  because islands are rectangles with lanes of at least 3 tiles; a map with concave coasts would need a flow field.
  Sliding along an island at a steep angle is slow, because only the tangential share of speed is kept.
- **The outbox is single-tab.** Two open tabs may both send the same pending record. The PUT is idempotent by
  `matchId`, so this never creates a duplicate, only an extra request.
- **The ranking shows only the configuration selected in Options.** The configs endpoint exists but has no selector.
- **Chromium only.** The mobile project is emulated Chromium, not WebKit or a real iOS device. There is no audio.

## Assets and licenses

The game art is the pack provided with the challenge. Its ships and tiles match Kenney's Pirate Pack (CC0), and the
UI atlas is the challenge's "Pirate Battle UI asset pack". The font is Nunito (SIL Open Font License 1.1). Sources,
what is shipped and every npm dependency's license are listed in [docs/licenses.md](docs/licenses.md).

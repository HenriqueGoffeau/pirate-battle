# Pirate Battle: Design Brief for Claude

> **Source of truth:** the challenge README (written in Portuguese) at `game-developer-challenge/README.md`.
> This brief is a faithful English translation of it, reorganized for architecture work. It also adds an inventory of the provided assets (checked against the actual files) and lists the decisions the README leaves open.
> If this brief and the README ever disagree, the README wins. Tell me about the conflict.

---

## 0. How to use this brief (instructions for Claude)

**Your role:** senior game and front-end architect, and my design partner. We are designing the architecture of a browser game **before** I implement it.

**What I want from you**

- Discuss the architecture. For every significant decision, give 2–3 workable approaches with their trade-offs, then **one clear recommendation**.
- Produce visual artifacts: layer/module diagrams, state machines, sequence diagrams, data contracts, screen wireframes, a milestone plan.
- Cite **requirement IDs** (for example `GP-03`, `API-11`) whenever a design choice satisfies a requirement or puts one at risk.
- Point out requirements a proposal does not cover, and any hidden coupling or lifecycle risk.
- When something is a **product decision** (see §8, Open questions), ask me instead of silently choosing. If you must assume something to move forward, label it `ASSUMPTION:`.

**How this work is graded — prioritize by these numbers, in every answer**

| Criterion | Points |
| --- | ---: |
| Gameplay, rules, collisions, enemy behavior | **35** |
| PixiJS, architecture, resource lifecycle | **20** |
| Interface, feedback, responsiveness, accessibility | **15** |
| TanStack Query, Axios, ranking/history consistency | **10** |
| Playwright tests | **10** |
| MSW and failure scenarios | **5** |
| Performance and documentation | **5** |
| **Total** | **100** |

Rules that follow from the table (details in §4):

- Every recommendation says **which criterion it earns points in**. If it earns none, say so, and expect me to cut it.
- When two designs are close, the one serving the **heavier** criterion wins. The game core plus its architecture is **55 points**; the whole data layer is 10.
- Nothing scores for extra features. Points come from the **listed requirements working**, from clear responsibilities, code quality, and reproducible runs.

**What I do NOT want yet**

- Full implementation code. Short snippets (types, interfaces, pseudo-code for a loop) are welcome when they make a design clearer.
- Replacing any mandatory technology (§2).
- Any real backend. Everything runs in the browser; the APIs are mocked.

**Library versions:** unless I say otherwise, assume the current stable majors: PixiJS v8, React 18/19, TanStack Query v5, MSW v2, Playwright latest.

### 0.1 Time budget: two days

I have **two days in total** to build, test, document, and deploy all of this: the game, the 12 Playwright areas, the visual baselines, both documents, the profiling evidence, and a working public deploy.

This changes how I want you to answer:

- Prefer the **smallest design that meets the requirement** over the most elegant one. When you recommend the bigger option, justify it against the clock.
- Give a **rough hour cost** for each proposal, and say plainly when something doesn't fit in the budget.
- Every plan MUST come with a **ranked cut list**: what I drop first if I fall behind, and what can never be dropped because the scoring criteria depend on it (§4).
- Prefer **authored data over algorithms** wherever it's viable. Data is faster to build, easier to debug, and deterministic for tests for free.

### 0.2 Decisions already made (don't re-open these)

| # | Decision | Reasoning |
| --- | --- | --- |
| D-A | **Arena:** one **hand-authored tile map**, fixed logical size of roughly **24×14 tiles of 64 px (≈1536×896)**, always **fully visible** and scaled to fit with letterboxing. No camera, no scrolling, **no procedural generation**. | GP-05 reads as a single visible arena. Generation would cost autotiling work, playability validation (connected water, no boxed-in player), harder enemy avoidance around concave coasts, and seed-pinned visual baselines. It doesn't fit in two days |
| D-B | The map is a **data file** (tile grid, solid mask, spawn points, player start), loaded through an interface the simulation doesn't look behind. Procedural generation is named as future work in `ARCHITECTURE.md`. | Keeps the door open at zero cost, and a stated omission reads as judgment rather than as a gap |
| D-C | **Spawn points are authored in the map data**, not computed from free water cells. At runtime they are only filtered by distance to the player and by occupancy. | Turns EN-06 from an algorithm into an array, and removes a whole class of bugs |
| D-D | **The Options screen exposes exactly the two required settings.** The full config (health, speeds, damage, ranges, cooldowns, spawn distribution) stays typed and data-driven per CFG-01 and CFG-02, but is only editable through a **dev panel behind a flag**, next to the MSW scenario selector. | Every extra player-facing setting splits the ranking into more buckets (API-03) and adds validation, persistence, and test surface for zero points |
| D-E | **Ranking config key = the two user options only.** A match played with a non-default balance config is marked `custom` and stays out of the leaderboard. | Keeps leaderboard comparisons honest while the dev panel exists |
| D-F | **No new gameplay entities or mechanics** beyond what the README requires: no health pickups, no power-ups, no upgrades, no boss. | No criterion in §4 pays for extra mechanics, and each one touches collisions, determinism, tests, and cleanup |
| D-G | **Personality** goes into things the criteria already pay for: ship feel and handling, sinking with debris and crew, damage stages, the hand-composed map, menu copy and identity, button states, fixture names, and the documentation. Sound is in scope as optional polish (see Q-21) and is the first thing cut. | These ride on required work (FX-01..04, UI-07, A11Y-01), so the personality is free |

**Vocabulary**

| Term | Meaning in this brief |
| --- | --- |
| **MUST** | Explicit requirement in the README |
| **SHOULD** | Strongly implied by the README or the mockups |
| **FREE** | Left to the candidate's choice |
| **Simulation** | The game-rules layer (entities, movement, combat, collisions, spawns), independent of rendering |
| **Match** | One play session, from start until time runs out, the player dies, or the player leaves |
| **Record** | The saved result of a *completed* match, sent to the mocked API |
| **Tick / step** | One simulation update |
| **Frame** | One render |

---

## 1. Project summary

Build **Pirate Battle**: a single-player, top-down 2D naval shooter that runs entirely in the browser. The player sails a ship between islands, fights enemy ships that keep spawning, and scores points until the timer ends or their ship sinks.

- **React** renders menus, forms, panels, and dialogs.
- **PixiJS** renders the game world.
- **Ranking** and **Match History** are REST APIs that are **mocked with MSW** (there is no server), called with **Axios** and managed by **TanStack Query**.
- **Playwright** covers end-to-end tests and visual regression.
- A **public deploy** is mandatory (Vercel recommended). Chosen route: self-hosted Docker image behind the author's reverse proxy on a subdomain, over HTTPS (see DEL-02).

The challenge grades gameplay, PixiJS skill, architecture, data integration, user experience, and delivery quality. The candidate must give a **time estimate before starting**.

---

## 2. Mandatory stack and hard constraints

| Responsibility | Technology |
| --- | --- |
| UI and menus | React |
| Language | TypeScript, **strict mode** |
| Game rendering | PixiJS |
| Remote state for ranking and history | TanStack Query |
| HTTP client for ranking and history | Axios |
| Mocking the ranking and history APIs | MSW |
| E2E tests and visual regression | Playwright |

| ID | Constraint |
| --- | --- |
| C-01 | Every technology above MUST play a real part in the solution, not just be installed. |
| C-02 | Build tool, styling approach, and extra libraries are FREE. |
| C-03 | Single-player; runs entirely in the browser. Gameplay and settings are local. |
| C-04 | Only ranking and match history go through the (mocked) REST APIs. Nothing else uses the network layer. |
| C-05 | UI text, code identifiers, and the solution's documentation MUST be in English. |
| C-06 | Movement, combat, collision, and enemy-behavior rules MUST be written by the candidate (so no physics engine or game framework deciding the rules). |
| C-07 | MUST run from a clean checkout, with no private services. |
| C-08 | The browser console MUST stay free of unhandled errors in every expected flow. |

---

## 3. Requirements (translated and numbered)

### 3.1 Player (GP)

| ID | Requirement |
| --- | --- |
| GP-01 | Moves forward and rotates left and right. (Reverse is not mentioned.) |
| GP-02 | **Front shot:** one projectile. |
| GP-03 | **Side shot (broadside):** three parallel projectiles, with separate commands for the ship's **left** and **right** sides. |
| GP-04 | Limited health, reduced by enemy projectiles and by a Chaser's impact. |
| GP-05 | Movement is limited to the **visible arena** and cannot pass through islands. |
| GP-06 | **Keyboard and touch** controls for movement, rotation, and attacks. |
| GP-07 | Moving and shooting **at the same time** MUST work (several keys held / multi-touch). |
| GP-08 | The controls MUST be shown in the interface. |

### 3.2 Enemies (EN)

| ID | Requirement |
| --- | --- |
| EN-01 | **Chaser:** chases the player, damages the player by colliding with their ship, and **explodes on impact**. |
| EN-02 | **Shooter:** approaches the player and fires once within its attack range. |
| EN-03 | Both types move forward, rotate, take damage, and respect island collisions. |
| EN-04 | Both types MUST appear during a standard match. |
| EN-05 | Enemies spawn at every configured interval until the match ends. |
| EN-06 | Spawn points MUST be clear of obstacles and far enough from the player that they can't cause unavoidable instant damage. |

### 3.3 Arena, collisions, combat (CB)

| ID | Requirement |
| --- | --- |
| CB-01 | The arena has water and **at least one island** that blocks both ships and projectiles. |
| CB-02 | Projectiles follow their direction, speed, damage, and **range or lifetime**. |
| CB-03 | Player shots hit enemies; enemy shots hit the player. |
| CB-04 | A projectile applies damage **exactly once**, and is removed when it hits a target or obstacle, expires, or leaves the arena. |
| CB-05 | Each weapon respects its own fire interval (cooldown). |
| CB-06 | Destroyed enemies stop dealing damage, stop shooting, and no longer take part in collisions. |

### 3.4 Match rules (MR)

| ID | Requirement |
| --- | --- |
| MR-01 | Duration configurable between **60 and 180 seconds of active play** (paused time does not count). |
| MR-02 | Each enemy destroyed **by the player's attacks** is worth **1 point**. A Chaser blowing itself up on the player scores **nothing**. |
| MR-03 | The match ends when time runs out **or** the player's health reaches zero. |
| MR-04 | Ending the match stops movement, attacks, damage, spawns, and scoring. |
| MR-05 | Restarting creates a **brand-new match**: health, score, timer, and entities all reset. |
| MR-06 | A health bar is drawn **above the player's ship and above every enemy**. |
| MR-07 | The HUD also shows **score** and **remaining time**. |
| MR-08 | Manual pause, plus **automatic pause** when the window loses focus or the tab is hidden. |
| MR-09 | While paused, the timer, cooldowns, and simulation are frozen. |
| MR-10 | Resuming **requires a player action** and MUST NOT apply movement or shots from the paused period (for example keys held or pressed during the pause). |

### 3.5 Animation and feedback (FX)

| ID | Requirement |
| --- | --- |
| FX-01 | Firing effects. |
| FX-02 | An explosion when a ship is destroyed. |
| FX-03 | Ships **look progressively more damaged** as their health drops. |
| FX-04 | Attacks, impacts, and damage give noticeable feedback without making the arena hard to read. |

### 3.6 Screens (UI)

| ID | Screen | Requirements |
| --- | --- | --- |
| UI-01 | Main menu | **Play** and **Options** actions, control instructions, **Ranking** and **Match History** tabs |
| UI-02 | Options | **Game session time** and **Enemy spawn time**, with validation, saving, and persistence after refresh |
| UI-03 | Match | PixiJS arena, HUD, controls, pause |
| UI-04 | Result | Total score, time played, why the match ended, **status of the match record** (saving / saved / pending / failed), **Play Again** and **Main Menu** actions |
| UI-05 | Ranking | Position, player identification, score, pagination |
| UI-06 | Match History | The player's history: date, score, duration, end reason, pagination |
| UI-07 | All menus | Visual identity is FREE but MUST match the game's assets |

### 3.7 Gameplay configuration and local persistence (CFG)

| ID | Requirement |
| --- | --- |
| CFG-01 | All gameplay parameters live in **one typed, tunable config**: match duration; spawn interval and spawn distribution; health; movement and rotation speeds; damage; projectile range, speed, and lifetime; cooldowns; Shooter attack range. |
| CFG-02 | Rebalancing MUST NOT require changes to system logic (data-driven). |
| CFG-03 | The Options screen exposes only session time and spawn interval. |
| CFG-04 | The spawn interval MUST be positive, with **documented limits** (the limits themselves are FREE). |
| CFG-05 | Each match uses a **snapshot** of the config taken when it starts. Later changes only apply to new matches. |
| CFG-06 | Reloading the page or leaving the combat screen **ends** the current match. An **abandoned match is never recorded** in ranking or history. |
| CFG-07 | Save locally: the player's options, and the **result of the last completed match**. |

### 3.8 PixiJS and architecture (ARCH)

| ID | Requirement |
| --- | --- |
| ARCH-01 | PixiJS draws the arena, ships, projectiles, effects, and indicators above ships. React draws menus, forms, panels, and dialogs. |
| ARCH-02 | Game rules, rendering, input, and UI state are kept separate. |
| ARCH-03 | **Time-based simulation:** movement, damage, and spawns don't depend on frame rate. |
| ARCH-04 | The UI stays in sync with the game **without a React re-render every frame**. |
| ARCH-05 | Textures are loaded once and reused, and load failures are handled **before combat starts**. |
| ARCH-06 | The canvas adapts to screen size and **pixel density (DPR)**, keeping proportions, input coordinates, and arena bounds correct. |
| ARCH-07 | Listeners, ticker, timers, entities, and resources are released when leaving or restarting. |
| ARCH-08 | Setup and teardown work correctly under **React Strict Mode** (effects run twice in development). |
| ARCH-09 | Continuous combat state stays **inside the simulation**, not in React state. The state-management and UI-sync strategy is FREE. |
| ARCH-10 | The main decisions are documented in `ARCHITECTURE.md`. |

### 3.9 Ranking and Match History APIs (API)

| ID | Requirement |
| --- | --- |
| API-01 | Typed contracts. **Ranking:** paginated leaderboard sorted by score. **History:** save a completed match, and fetch the player's paginated history. |
| API-02 | Every record contains: match id, player id, date, score, **effective duration**, end reason, **config used**. |
| API-03 | The ranking only compares matches **played with the same configuration**. |
| API-04 | Ties are broken by a **deterministic** rule (FREE, but it must be defined). |
| API-05 | Other players come from **fixtures**. |
| API-06 | Axios for HTTP; TanStack Query for both the queries **and** the save (mutation). |
| API-07 | Handles loading, empty, error, background refresh, cache, invalidation, and retries. |
| API-08 | **Both tabs refresh** after a record is saved **and** whenever they are shown again. |
| API-09 | **Late responses must not overwrite newer data.** |
| API-10 | One completed match produces **exactly one** history record and **exactly one** ranking entry. |
| API-11 | Re-sending or repeated clicks MUST get back the existing record, **never create a duplicate** (idempotency). |
| API-12 | **Pending records survive failures and page refresh**, and can be retried. |
| API-13 | The player can start another match **while a record is still pending**. |
| API-14 | API failures never block the game or the options, and never interrupt combat. |

### 3.10 MSW mocks (MSW)

| ID | Requirement |
| --- | --- |
| MSW-01 | Mocks sit at the **network layer**. Contracts, fixtures, and handlers are **shared** between development, tests, and the demo. |
| MSW-02 | Saved (confirmed) records show up in later queries, and both tabs stay consistent with each other. |
| MSW-03 | Configurable, reproducible scenarios for everything below. |
| MSW-03a | Success, empty lists, multiple pages. |
| MSW-03b | Slow responses, variable latency, **responses arriving out of order**. |
| MSW-03c | Timeout, connection failure, HTTP 4xx and 5xx. |
| MSW-03d | Failure when loading ranking or history. |
| MSW-03e | **Timeout after the save succeeded on the "server"** (the client never got the response), then recovery **without duplication**. |
| MSW-03f | API unavailable when the match ends, then the save goes through once it recovers. |
| MSW-04 | A way to **select a scenario** and **reset to the initial state**. |
| MSW-05 | Randomness and latency are controllable in tests. |
| MSW-06 | The mocks **work in the published production build**. |
| MSW-07 | Local persistence keeps confirmed records (the fake "server database") and pending submissions across refresh. |

### 3.11 Interface, assets, accessibility (A11Y)

| ID | Requirement |
| --- | --- |
| A11Y-01 | The provided assets are the visual base. Converting atlases, optimizing images, and adding resources are allowed; **include sources and licenses** in the delivery. |
| A11Y-02 | Works on desktop and mobile, with usable touch controls and **no clipping** of the arena or HUD. |
| A11Y-03 | Pick the supported **mobile orientation**, and adapt the layout on resize **without changing match rules**. |
| A11Y-04 | Loading the match assets shows **visible progress** or a loading state. |
| A11Y-05 | Keyboard navigation in menus, visible focus, **focus management in dialogs**, labels, sufficient contrast, accessible error messages. |
| A11Y-06 | Score, time, and match state are **also exposed as semantic HTML** (screen-reader friendly), **without announcing every frame**. |
| A11Y-07 | Game keys are captured **only while gameplay is active**. |

### 3.12 Playwright tests (TEST)

E2E tests MUST cover:

| ID | Coverage |
| --- | --- |
| TEST-01 | Navigation, validation, and persistence of options. |
| TEST-02 | Asset loading, load failures, and retry. |
| TEST-03 | Starting a match, movement, rotation, arena bounds, collision with islands. |
| TEST-04 | Front and side shots, damage, cooldown, scoring without duplicates. |
| TEST-05 | Chaser and Shooter behavior, and the spawn interval. |
| TEST-06 | Ending by time and by death, the simulation stopping, and a clean restart. |
| TEST-07 | Pause, focus loss, and resume without the timer advancing wrongly. |
| TEST-08 | The result screen, and the result persisting after refresh. |
| TEST-09 | Abandoning a match, navigating back and forth between screens repeatedly, touch controls. |
| TEST-10 | Loading and paging the Ranking and Match History tabs, including loading, empty, and error states. |
| TEST-11 | Saving a match, both tabs refreshing, recovering a pending submission after refresh. |
| TEST-12 | Re-sending after a timeout without duplicates, and late responses not overwriting newer data. |

Test infrastructure rules:

| ID | Requirement |
| --- | --- |
| TEST-13 | Main flows run on **Chromium, desktop and mobile**. |
| TEST-14 | **Visual regression** for the menu, the arena in a **stable state**, and the result screen, with baselines committed to the repo. |
| TEST-15 | **Seeded** scenarios and **control of the simulation clock** make tests reproducible. |
| TEST-16 | Test instrumentation MAY read state and control the clock, but rules, input, collisions, and rendering MUST run for real. Combat tests MUST **press the game's controls** and check the effects (no shortcuts like calling an internal "kill enemy" function). |
| TEST-17 | Every test starts from an **isolated state**. |
| TEST-18 | An HTML report, plus **traces for failures**. |

### 3.13 Performance (PERF)

| ID | Requirement |
| --- | --- |
| PERF-01 | Measure combat performance in an **optimized build**, targeting **60 FPS** on a documented reference machine. |
| PERF-02 | Record FPS, **p95 frame time**, and **entity count** during a **3-minute** match. |
| PERF-03 | Check memory after **5 cycles of start → play → exit**, and investigate any steady growth. |
| PERF-04 | Profiling evidence that states hardware, browser, resolution, match config, and observed limitations. |

### 3.14 Delivery (DEL)

| ID | Requirement |
| --- | --- |
| DEL-01 | Repo with source code, lockfile, assets, mocks, fixtures, tests. |
| DEL-02 | **Public deploy is mandatory** (Vercel recommended; Netlify and Cloudflare Pages accepted). It must match the delivered code, stay up during evaluation, run the ranking and history mocks, and work **when opened or reloaded on any URL**. **Decision:** self-hosted — a Docker image (nginx) behind the author's existing reverse proxy on a dedicated subdomain, HTTPS with a trusted certificate. The README states this choice explicitly, since the challenge names only Vercel, Netlify and Cloudflare Pages; a static mirror on Cloudflare Pages remains the fallback. |
| DEL-03 | `README.md` covers setup, env vars, controls, gameplay config, how to select and reset network scenarios, commands, and how to reproduce failures. Scripts for **dev, build, preview, lint, typecheck, Playwright**. |
| DEL-04 | `ARCHITECTURE.md` covers the React/PixiJS integration, simulation loop, collisions, resource management, local persistence, and the ranking/history integration (contracts, cache, pending-record recovery), plus limitations and balancing decisions. |
| DEL-05 | Test reports and profiling reports are included. |

---

## 4. Scoring weights (use these to prioritize)

Repeated from §0 on purpose: this table drives every trade-off in this project.

| Criterion | Points |
| --- | ---: |
| Gameplay, rules, collisions, enemy behavior | **35** |
| PixiJS, architecture, resource lifecycle | **20** |
| Interface, feedback, responsiveness, accessibility | **15** |
| TanStack Query, Axios, ranking/history consistency | **10** |
| Playwright tests | **10** |
| MSW and failure scenarios | **5** |
| Performance and documentation | **5** |
| **Total** | **100** |

Graders also look at: the whole match working end to end, clear separation of responsibilities, code quality, and reproducible runs.

**Takeaway:** 55% of the grade is the game core plus its architecture. The simulation, collisions, AI, and Pixi lifecycle deserve the most design attention. The data layer is only 15%, but it is dense with edge cases (idempotency, outbox, stale responses).

---

## 5. Visual reference (provided mockups)

All mockups are in `game-developer-challenge/assets/`, at 1800×1000.

### 5.1 Overall style

- Stylized cartoon, top-down view. Bright turquoise water, sandy beaches, green grass, stone forts, palm trees, rocks.
- **Panels:** dark navy/slate board texture inside a thick orange **wooden frame** with **gold rivets** in the corners.
- **Primary buttons:** gold/amber pills with wooden end caps; dark, bold, uppercase labels.
- **Secondary buttons:** dark navy with a wooden frame; light labels. Used for the *inactive* tab.
- **Round buttons:** bronze circles with an icon (touch controls, pause, steppers, pagination).
- **Typography:** cream/off-white bold uppercase headings, gold numbers, small spaced uppercase captions.
- **Background:** the arena scene (`ui_scene_background.png`) sits behind every menu panel. A Jungle Gaming logo sits in the bottom-right corner.

### 5.2 Screen by screen

| Mockup | What it shows | Required but **missing** from the mockup |
| --- | --- | --- |
| `sample.png` (in match) | Top-left: heart icon + wide health bar reading "76 / 100". Top-right: star counter "24", clock counter "01:42", round pause button. Bottom-left: turn-left, forward (raised), turn-right. Bottom-right: fire-left, fire-front (raised), fire-right. Small red health bars above enemies. Cannonballs leave white trail lines. A burning ship, a grey wreck, crew swimming in ripple circles, floating wood debris. | Health bar **above the player's ship** (MR-06); a way to tell the player's ship apart; semantic HUD (A11Y-06) |
| `sample_menu.png` | "PIRATE BATTLE" wooden title, tagline "SET SAIL. TAKE COMMAND.", PLAY and OPTIONS buttons, a small ship icon, "Navigate the islands. Survive the battle.", RANKING and MATCH HISTORY buttons | **Control instructions** (UI-01); a pending-record indicator; entry point to the network-scenario selector |
| `sample_options.png` | "OPTIONS". "Game session time" with −/+ round buttons, value "120 s". "Enemy spawn time" with −/+, value "3 s". MAIN MENU button | Explicit save feedback, validation/error messages (UI-02, A11Y-05), visible limits |
| `sample_pause.png` | "PAUSED", "Ready when you are.", RESUME / OPTIONS / MAIN MENU | A note that options changed here only apply to the next match (CFG-05) |
| `sample_result.png` | "BATTLE COMPLETE", large score "24", caption "POINTS · 02:00 · TIME UP", PLAY AGAIN / MAIN MENU | **Record status** and a retry action (UI-04); a variant for defeat |
| `sample_ranking.png` | Wide panel titled "CAPTAIN'S LOG" with RANKING (active, gold) and MATCH HISTORY (inactive, dark) tabs. Caption "120 SECOND BATTLES · 3 SECOND SPAWN INTERVAL" (the ranking is filtered by config). Columns RANK / CAPTAIN / POINTS / PLAYED. Rows: 01 ★ Captain Flint 38 · 02 Red Sparrow 32 · **03 Captain Jack `YOU` 24** (highlighted row) · 04 Storm Rider 21 · 05 Sea Wolf 19. Date format "08 SEP · 21:42". Pagination "PAGE 1 OF 3" with round prev/next. 5 rows per page. MAIN MENU | Loading, empty, error, and background-refresh states; a way to browse other configs (open question) |
| `sample_history.png` | Same panel, MATCH HISTORY active. Caption "CAPTAIN JACK · YOUR RECENT BATTLES". Columns DATE / POINTS / DURATION / RESULT. Result is "TIME UP" (green tint) or "DEFEATED" (red tint). Newest row highlighted. "PAGE 1 OF 2" | Loading, empty, error states; pending (unconfirmed) records |

Also **missing entirely**: the asset loading screen (A11Y-04), the asset load-failure screen with retry (TEST-02), mobile layouts (portrait and landscape), the touch-control layout on small screens, and the network-scenario selector (MSW-04).

---

## 6. Asset inventory (verified against the files)

Root folder: `game-developer-challenge/assets/`

### 6.1 Folder map

| Path | Contents |
| --- | --- |
| `png/default/` | Individual PNGs at 1×. Subfolders: `ships/` (30), `ship_parts/` (67), `effects/` (5), `tiles/` (96), `ui/controls/` (17), `ui/hud/` (11), `ui/menu/` (8) |
| `png/retina/` | Same file names as `default/`. See the retina caveat in §6.7 |
| `spritesheet/ships_miscellaneous_sheet.png` + `.xml` | 1024×512 atlas of **all ships, ship parts, and effects** (102 frames), plus a `_retina` pair |
| `spritesheet/ui_sheet.png` + `.json` | 1024×1024 UI atlas (36 frames, JSON hash format) with rich layout metadata; `ui_sheet_retina` is 2048×2048 at scale 2 |
| `tilesheet/tiles_sheet.png` | 1024×384 grid of **64×64 tiles, no margin**, so **16 columns × 6 rows = 96 tiles** (retina version is 2048×768 with 128 px tiles). **There is no data file:** tiles are addressed by grid position |
| `sounds/` | 27 WAV files |
| `vector/` | SVG and SWF source art (not needed at runtime) |
| `ui_scene_background.png` | 918×515 arena scene used behind the menus |
| `preview.png` | 918×515 overview of the whole asset pack |
| `sample*.png` | The 7 mockups from §5 |
| `logo_jungle_gaming.svg` | Brand logo |

### 6.2 Ships (the key to FX-03)

`ship_1.png` … `ship_24.png`, 66×113 each, arranged as **6 color variants × 4 damage stages**:

| File range | Damage stage |
| --- | --- |
| `ship_1` – `ship_6` | Intact |
| `ship_7` – `ship_12` | Damaged (torn sail) |
| `ship_13` – `ship_18` | Heavily damaged |
| `ship_19` – `ship_24` | Wreck (grey, burnt) |

Color order within each stage: **1 white · 2 black with skull · 3 red with cross · 4 green with crossed swords · 5 blue with horse head · 6 yellow with X** (verified).

- Formula: `stage = floor((n - 1) / 6)`, `color = (n - 1) % 6`.
- **Orientation:** the bow (pointed end) faces **down (+Y)** in the source image, so rendering needs a rotation offset relative to the simulation's heading convention.

Also available: `dinghy_large_1..3` (20×38) and `dinghy_small_1..3` (16×26), small boats usable as decoration or debris.

### 6.3 Ship parts (for building ships from parts or for debris)

| Part | Files and size |
| --- | --- |
| Hulls | `hull_large_1..4` (50×108), `hull_small_1..4` (40×108) |
| Sails | `sail_large_1..24` (66×~47), `sail_small_1..13` (42×~9) |
| Cannons | `cannon` (29×16), `cannon_mobile`, `cannon_loose` |
| Projectile | `cannon_ball` (**10×10**) |
| Crew | `crew_1..6` (~22×20) |
| Flags | `flag_1..6` |
| Other | `nest`, `pole`, `wood_1..4` (debris, ~15–26 × 7–10) |

### 6.4 Effects

| File | Size |
| --- | --- |
| `explosion_1` | 74×75 |
| `explosion_2` | 60×59 |
| `explosion_3` | 42×41 |
| `fire_1` | 18×39 |
| `fire_2` | 11×27 |

These are 3 explosion sizes and 2 flame sprites, **not frame-by-frame animations**. Any animation (scale, fade, sequencing) must be done in code.

### 6.5 UI atlas metadata (`ui_sheet.json`)

A standard TexturePacker-style JSON hash (`frames`, `meta`) that PixiJS can load, **extended** with:

- `anchor`, plus `borders` (9-slice insets) on `panel_menu` (left/right 32, top/bottom 40), which fits PixiJS's nine-slice sprite.
- `ui.family`: `menu`, `hud`, or `controls`.
- `ui.image`: path to the matching individual PNG.
- `ui.alpha_bounds`: the visible (non-transparent) area.
- `ui.layout`, which depends on the group:
  - `menu_button` (primary normal/hover/pressed/disabled, secondary normal/pressed; 256×88): `outer_rect`, **`label_rect`** (where the text goes).
  - `round_button` (normal/hover/pressed; 64×64): `outer_rect`, `icon_center`, `icon_render_size` (32×32).
  - `player_health` (`health_frame` + fills **green / amber / red**; 256×48): `frame`, **`fill_rect`** (x30 y15 w196 h20), `clip_axis: x`, `clip_origin: left`, `draw_order: [frame, fill]`. Draw the fill clipped by the health percentage.
  - `enemy_health` (`enemy_health_frame` + fills **green / red**; 160×40): `fill_rect` (x24 y12 w112 h15), same clipping rules.
- `panel_menu` (384×480) has a `content_rect`.
- Other frames: `title_pirate_battle` (384×128), `counter_panel` (160×56), and 48×48 icons: `heart`, `score` (star), `time` (clock), `fire_front`, `fire_left`, `fire_right`, `forward`, `turn_left`, `turn_right`, `pause`, `play`, `restart`, `home`, `settings`, `close`, `plus`, `minus`.
- `meta.ui`: `coordinate_space: untrimmed_sprite_top_left`, `units: logical_pixels` (all rects are in 1× units, even in the retina atlas).

**Design question:** the menus are React, so these UI sprites will probably be used as CSS backgrounds or `border-image` in React, and as Pixi sprites only for the over-ship health bars (and maybe the HUD). The metadata is useful for both.

### 6.6 Sounds (27 WAV files, 44.1 kHz)

| Group | Files |
| --- | --- |
| Weapons | `cannon_fire_1..3` (~1.2 s), `cannon_broadside` (1.7 s) |
| Impacts | `ship_wood_hit_1..2` (0.6 s), `cannonball_water_hit_1..2` (~1 s), `ship_collision` (1.45 s) |
| Destruction | `ship_explosion_1..2` (~2.5 s), `ship_sinking` (3.3 s) |
| Match flow | `game_start`, `game_pause`, `game_resume`, `game_complete`, `game_over`, `time_warning`, `health_low`, `score_point` |
| UI | `ui_click`, `ui_hover`, `ui_open`, `ui_close`, `ui_back` |
| Loops (stereo) | `ocean_ambience_loop` (12 s, **2 MB**), `ship_sailing_loop` (8 s, **1.4 MB**) |

Sound is **not an explicit README requirement**, but it helps FX-04. Total WAV size is about 5.7 MB, so converting to a compressed format is worth considering (allowed under A11Y-01). Browser autoplay rules mean audio only unlocks after a user gesture. A mute toggle would be an addition of ours, not something the README asks for.

### 6.7 Caveats found in the files

- **Retina ships, ship parts, and effects are NOT 2×.** `png/retina/ships|ship_parts|effects` are byte-identical to `default`, and `ships_miscellaneous_sheet_retina.png` is also 1024×512 with the same frame sizes. Only **tiles and UI** have real 2× versions.
- **PixiJS cannot load the ships atlas directly:** it is Starling/Sparrow XML (`<TextureAtlas><SubTexture name x y width height/>`), not Pixi JSON. Options: convert it to JSON at build time, write a small runtime parser, or load the individual PNGs.
- **The tile sheet has no metadata.** Tile index → (column, row) is probably row-major (`tile_1` top-left), but **verify** before building the map. Which tiles are solid (land, rock, fort) versus water must be defined by us.
- **License:** the ship and tile art looks like it's based on Kenney's *Pirate Pack* (CC0), and the UI pack is custom ("Pirate Battle UI asset pack" in the atlas meta). **Verify** and document sources and licenses (A11Y-01).

---

## 7. Architecture topics to discuss

For each topic: the question, candidate approaches (not decisions), what to watch out for, and the related requirements. Please challenge these and bring better options.

### 7.1 Layers and module boundaries

**Question:** how should the code be split so that rules, rendering, input, and UI state are clearly separated (ARCH-02)?

**Candidate layers:**
- `sim` (pure TypeScript: no Pixi, no DOM, no React)
- `render` (Pixi views that read sim state)
- `input` (keyboard/touch → intents)
- `session` (loop, clock, pause, lifecycle; owns sim + render + input)
- `ui` (React screens)
- `data` (API contracts, Axios client, Query hooks, local persistence, outbox)
- `mocks` (MSW handlers, fixtures, scenarios, fake DB)
- `testing` (test hooks)

**Rule to discuss:** `sim` depends on nothing, and nothing in `sim` knows about frames or pixels.

**Watch out for:** Pixi objects leaking into the sim (for example storing positions on sprites), or React state holding entity data.

### 7.2 Simulation loop and time

**Question:** fixed timestep or variable delta?

**Options:**
- **(a)** Fixed step (for example 60 Hz) with an accumulator; rendering interpolates between steps.
- **(b)** Variable `dt`, clamped to a maximum.
- **(c)** Fixed step with no interpolation.

**Considerations:**
- Determinism and seeded tests (TEST-15) favor a fixed step.
- An injectable **clock** (real vs. manual) lets tests step time.
- Clamp large gaps (tab switches) to avoid a "spiral of death".
- Choose between Pixi's `Ticker` and our own `requestAnimationFrame` loop.
- Pausing must freeze sim time, cooldowns, spawn timers, and the match timer together (MR-09).

**Related:** ARCH-03, MR-01, MR-09, TEST-07, TEST-15.

### 7.3 Entity model

**Options:**
- **(a)** Plain data objects plus systems (lightweight ECS: movement, AI, weapons, projectiles, collision, damage, lifetime, spawn, scoring).
- **(b)** Class per entity type with `update()`.
- **(c)** A hybrid.

**Considerations:**
- Object pools for projectiles and effects (PERF).
- A "dead" flag versus immediate removal, and when removal happens within a tick (CB-06).
- Stable entity ids for test observation.
- Tracking who fired a projectile, for scoring (MR-02).

### 7.4 React ↔ PixiJS bridge

**Question:** how does React host the canvas and receive game updates without re-rendering every frame (ARCH-04)?

**Options:**
- **(a)** Imperative Pixi owned by a `GameSession` class. A React `GameHost` component mounts it into a ref. The session publishes **coarse events or snapshots** (score changed, whole second elapsed, health changed, match state changed) to a small external store, read with `useSyncExternalStore`.
- **(b)** `@pixi/react` for the scene graph.
- **(c)** An event emitter with React listeners that update only on change.

**Considerations:**
- PixiJS v8's `app.init()` is **async**. Under Strict Mode, mount → unmount → mount can resolve `init` **after** the unmount, so it needs a cancellation guard and idempotent `destroy` (ARCH-08).
- Should the HUD (score/time/health) be React HTML overlaid on the canvas, or Pixi? A React overlay updated only on change satisfies ARCH-04 and A11Y-06 together. Over-ship health bars MUST be Pixi.

### 7.5 Input

**Design points:**
- One **input state** fed by keyboard (`keydown`/`keyup` using `event.code`) and touch buttons (pointer events, multi-touch, `pointercancel`/`lostpointercapture`).
- The session samples input into **intents** once per tick.

**Rules to design:**
- Listeners attached **only while gameplay is active** (A11Y-07).
- `preventDefault` only for game keys, and only in the game context.
- **Clear all held input on pause, blur, and visibility change**, and require a *new* press after resuming (MR-10).
- Fire commands are edge-triggered (press) vs. level-triggered (hold to auto-fire, limited by cooldown).
- Simultaneous move + fire (GP-07).

**Key bindings:** open question (see §8).

### 7.6 Arena, world coordinates, resize

**Decided (D-A, D-B):** a fixed logical world of about **24×14 tiles of 64 px (≈1536×896)**, hand-authored, **always fully visible**, scaled to fit the viewport with letterboxing. No camera and no scrolling. To make the arena feel roomier, lower ship speed relative to the arena rather than growing the map past the viewport.

**Map data shape to design:**
- A tile-id grid for rendering, plus a **solid mask** for collisions (which tile ids block ships and projectiles).
- **Spawn points** with their allowed enemy types (D-C).
- The player's start position and heading.
- Loaded through one interface, so a generator could replace the file later without the simulation noticing.

**Authoring:** Tiled is a reasonable route (import `tiles_sheet.png` as a 64 px grid tileset, paint, export JSON, write a small loader). Islands should be kept roughly convex with open water between them, so simple steering is enough for enemy avoidance (§7.8).

**Still to design:**
- Pixi `resolution = devicePixelRatio` plus `autoDensity`, a `ResizeObserver` on the container, and a single world-container scale.
- Pointer → world via `toLocal`.
- Resizing must never change the rules (A11Y-03).
- Mobile orientation: probably landscape-only with a "rotate your device" prompt (Q-08).
- A static tile layer (cached container or pre-rendered texture) rather than 336 individual sprites redrawn every frame.

**Related:** ARCH-06, A11Y-02, A11Y-03, TEST-13.

**Bonus from D-A:** because every match is played on the same arena, matches with the same settings really are comparable in the ranking (API-03), and the visual baselines (TEST-14) are stable without pinning a map seed.

### 7.7 Collisions

**Shapes:** a circle or capsule for ships (they are elongated, 66×113), a circle or point for cannonballs (10×10), and islands as a **solid-tile mask** on the grid, or as polygons/rectangles.

**Questions to design:**
- **Ship vs. island:** block (cancel movement), slide along the edge, or push out?
- **Ship vs. ship:** blocking and damage rules (open question).
- **Tunneling:** fast projectiles need a swept test (segment vs. circle / tile raycast).
- **Arena bounds:** clamp ships; remove projectiles that leave.
- **Broad phase:** a spatial hash, or a simple O(n²) given expected entity counts.
- **Damage once:** a projectile is marked consumed on first hit, within the same tick (CB-04).

### 7.8 Enemy AI

**Chaser:**
- Steer toward the player: rotate at most `turnRate·dt`, then move forward.
- On contact, damage the player **and** self-destruct with **no score** (EN-01, MR-02).

**Shooter:**
- Approach to a preferred range, then fire when within `attackRange` (and aligned?).
- Which weapon it uses is FREE: front shot, broadside, or a simplified single shot.

**Obstacle avoidance** (EN-03), with options:
- **(a)** Feeler rays with steering.
- **(b)** A flow field / BFS distance map on the tile grid toward the player.
- **(c)** A* on the tile grid, recalculated every N ms.

**Watch out for:** enemies getting stuck on island corners, and every enemy stacking on the same spot (separation force?).

### 7.9 Spawning

- A timer in **sim time** at `spawnInterval` (EN-05).
- Type chosen by weights from the config (CFG-01), with a guarantee that **both types appear** in a standard match (EN-04). For example, alternate the first two spawns, or force the missing type after K spawns.
- **Spawn point (D-C):** candidates come from the **map data**, authored around the arena so enemies arrive from every direction. At runtime, filter them by minimum distance from the player and by occupancy (no ship already sitting there), then pick one with the seeded RNG. If nothing qualifies, skip this interval rather than spawning unfairly (EN-06). No free-water computation is needed, because every authored point is already clear of islands.
- A **seeded RNG** is injected (TEST-15).
- Maybe a cap on concurrent enemies (PERF, open question).

### 7.10 Match lifecycle (state machine)

**Draft states:** `idle → loadingAssets → (assetError ⇄ retry) → ready → running ⇄ paused → ended{timeUp | defeated}`, plus `abandoned` (leaving or reloading during `running` or `paused`).

**Rules to capture:**
- Only `ended` produces a record (CFG-06).
- Ending freezes everything (MR-04).
- Restart builds a fresh sim from a **new config snapshot** (MR-05, CFG-05).
- Resume needs an explicit action; maybe a short countdown (open question).
- Auto-pause on `blur` and `visibilitychange` (MR-08).

### 7.11 Configuration

- `GameConfig`: a typed, frozen defaults object holding every balancing number (CFG-01).
- `UserOptions`: `{ sessionSeconds, spawnIntervalSeconds }`, validated (schema library optional), saved locally (UI-02).
- At match start: `MatchConfig = freeze(merge(GameConfig, UserOptions))`. This snapshot goes into the record (API-02).
- A **`configKey`** built from the two user options only (for example `"s120-i3"`) groups the ranking (API-03, decided in D-E).
- **Dev panel (D-D):** behind a flag, next to the MSW scenario selector, it edits the whole `GameConfig` live. This is what demonstrates CFG-02, instead of a pile of player-facing sliders. A match started from a non-default balance config carries a `custom` marker in its record and stays out of the leaderboard.
- The record still stores the **full config snapshot** (API-02), even though only part of it forms the `configKey`.

### 7.12 Assets: loading, reuse, failure

- PixiJS `Assets` with a manifest/bundles, and an `onProgress` callback shown on the loading screen (A11Y-04).
- Load **before** combat. On failure, show an error screen with **Retry** (ARCH-05, TEST-02).
- **Reuse:** textures are loaded once per app lifetime and **not** destroyed between matches; only match entities are destroyed. Discuss the alternative of unloading everything on exit.
- Handle the ships XML atlas (§6.7).
- 1× vs 2× selection by DPR (only tiles and UI have real 2×).
- Tests need a way to simulate a load failure (for example a query flag, or blocking a URL with Playwright's `page.route`).
- Audio loading must never block the match.

### 7.13 Resource cleanup and Strict Mode

- A single `dispose()` chain: remove listeners (keyboard, pointer, blur, visibility, resize), stop the ticker/loop, clear timers, destroy the stage children, release pools, unsubscribe from the store, stop audio.
- An idempotent destroy that is safe to call twice or before init finishes (ARCH-07, ARCH-08).
- Verified by PERF-03 (5 cycles, heap snapshots) and TEST-09 (repeated navigation).

### 7.14 Local persistence (localStorage)

**Candidate keys** (versioned, validated on read, with a safe fallback for corrupt data):

| Key | Contents |
| --- | --- |
| `pb:v1:options` | Player options |
| `pb:v1:player` | Local player id and name |
| `pb:v1:lastResult` | Last completed match (CFG-07, TEST-08) |
| `pb:v1:outbox` | Pending record submissions, client side (API-12) |
| `pb:v1:mockDb` | The MSW "server database" of confirmed records (MSW-07) |
| `pb:v1:scenario` | Selected network scenario |

**Keep separate:** the client outbox and the mock server DB are different things, even though both live in the same browser.

### 7.15 API contracts

**Candidate endpoints:**

| Method and path | Purpose |
| --- | --- |
| `GET /api/ranking?configKey=&page=&pageSize=` | → `Page<RankingEntry>` |
| `GET /api/players/:playerId/matches?page=&pageSize=` | → `Page<MatchRecord>` |
| `PUT /api/matches/:matchId` | Idempotent: body is the record, `matchId` is a client-generated UUID. Returns `201` when created, `200` with the existing record when already present |

Alternative: `POST /api/matches` with an `Idempotency-Key` header.

**Tie-breaking** (API-04), options: score desc → duration asc (or desc?) → date asc (earlier wins) → matchId asc.

**Ranking granularity:** one entry per match (the README says "one ranking entry" per match) versus best per player. See §8.

**Also define:** an error shape, and a `Page<T>` shape (`items`, `page`, `pageSize`, `totalItems`, `totalPages`).

### 7.16 Record submission (outbox pattern)

**Draft flow:**
1. Match ends → build a `MatchRecord` with a UUID.
2. **Write it to the outbox first**, then run the mutation.
3. **On success:** remove it from the outbox, `invalidateQueries` for ranking and history.
4. **On failure:** keep it `pending`, show the status on the Result screen, retry with backoff, and offer manual retry.
5. **On app start:** flush the outbox.

**Guarantees:**
- **No duplicates**, because retries reuse the same `matchId` (API-10, API-11, MSW-03e).
- **No double flush** of the same item: an in-flight guard, maybe across tabs.
- New matches can start while items are pending (API-13).
- Nothing here ever blocks gameplay (API-14).

**Question:** should the Result screen and the tabs show pending records optimistically, and how are they labeled?

### 7.17 Queries, cache, stale responses

- Query keys include `playerId`, `configKey`, `page`.
- Keep the previous page while the next one loads.
- Show a background-refetch indicator.
- `refetchOnMount` / refetch when a tab becomes visible again (API-08).
- Retry policy: don't retry 4xx; retry 5xx and network errors a limited number of times.
- **Stale responses (API-09):** pass the query's `AbortSignal` into Axios, cancel in-flight requests on invalidate/refetch, and rely on query-key separation between pages. Discuss whether that is enough for MSW-03b (out-of-order responses), or whether extra guards are needed (a request sequence number or server `updatedAt`).

### 7.18 MSW scenarios

- A **scenario registry**: `success`, `empty`, `manyPages`, `slow`, `jitter`, `outOfOrder`, `timeout`, `networkError`, `http4xx`, `http5xx`, `rankingFails`, `historyFails`, `timeoutAfterSave`, `downThenRecover`.
- **Selection:** URL query (`?scenario=`), a small dev/demo panel (also available in production, MSW-06), and a test API. **Reset:** restore fixtures and clear the outbox (MSW-04).
- Seeded latency and randomness (MSW-05).
- **`timeoutAfterSave`:** the handler saves to the DB, then delays longer than the client timeout.
- **`outOfOrder`:** the delay depends on a request counter, so an earlier request answers later.
- **Production:** the service worker must start **before** the first render and before any query; `mockServiceWorker.js` is served from the site root; unhandled requests (assets) pass through (`onUnhandledRequest: 'bypass'`).
- **SPA rewrites** on the host must not swallow `mockServiceWorker.js` or asset URLs (DEL-02).
- **Secure context:** service workers register only over HTTPS (or `localhost`), so the self-hosted deploy must terminate TLS with a trusted certificate; a plain-HTTP LAN address disables every mock.

### 7.19 Test hooks and determinism

- A test-only global (for example `window.__PB_TEST__`), enabled by a URL flag or env. It exposes: `setSeed`, `useManualClock`, `advance(ms)` / `step(n)`, a read-only `getSnapshot()` (entities, positions, headings, health, cooldowns, score, timer, state), and `setScenario` / `reset`.
- **Inputs go through real keyboard and touch events** from Playwright (TEST-16).
- **Visual regression stability:** fixed seed, frozen clock, fixed viewport and DPR, fonts loaded, water/ambient animations paused, and the arena captured in a known state (TEST-14).
- **Isolation:** fresh storage per test, and a scenario reset (TEST-17).
- **Question:** do the test hooks ship in the production build (behind a flag), or only in a test build? Visual tests and the demo might need the same build.

### 7.20 Accessibility

- A semantic HUD (visually hidden, or the visible React HUD itself) with `aria-live="polite"` announcements **on change only**: score changes, time at milestones (for example every 30 s and the last 10 s), match state (paused, ended) (A11Y-06).
- Canvas `aria-hidden`, or a `role="img"` label.
- Dialogs (Pause, Result) with focus trap and focus return (native `<dialog>` or a small hook).
- Visible `:focus-visible` styles on the wood/gold buttons, contrast checks on the cream-on-navy text, accessible error messages in Options (A11Y-05).
- `prefers-reduced-motion` for screen shake and flashes (optional).

### 7.21 Performance and measurement

- **Batching:** atlas textures mean fewer draw calls; tiles can render as a static layer (cached container or pre-rendered texture).
- Pooled projectiles and effects; no allocations per tick in hot paths.
- Remove, instead of hiding, dead entities.
- **Measurement:** a perf probe that records frame deltas → FPS, p95, and an entity-count timeline over 3 minutes, exported as JSON. It could be triggered by a Playwright script against `vite preview` or the deployed build (PERF-01, PERF-02).
- **Memory:** 5 start/play/exit cycles with heap snapshots in Chrome DevTools, plus `performance.memory` or CDP metrics from Playwright (PERF-03).

---

## 8. Open questions (product decisions for me; ask before assuming)

Anything already settled is in **§0.2** — don't re-open those. Everything below is still mine to answer, so ask rather than assume, and keep in mind the two-day budget (§0.1) when you propose defaults.

| # | Question | Notes / mockup hints |
| --- | --- | --- |
| Q-01 | **Player identity:** a fixed local "Captain Jack", a name prompt on first launch, or a generated id with an editable name? | The mockups show "Captain Jack" with a `YOU` badge |
| Q-02 | **Which config does the Ranking tab show?** Only the current options, or with a selector for other configs? | The ranking caption shows "120 SECOND BATTLES · 3 SECOND SPAWN INTERVAL" |
| ~~Q-03~~ | *Decided in D-E: the config key is the two user options only; custom balance configs are marked and excluded from the ranking.* | API-03 |
| Q-04 | Tie-break order (score → duration → date → id)? And does a shorter duration count as better or worse at equal score? | API-04 |
| Q-05 | Ranking: **one row per match** (a player can appear several times) or **best per player**? | The README says each match yields one ranking entry |
| Q-06 | Limits and step sizes: session time 60–180 s in steps of 10? Spawn interval, for example 1–10 s in steps of 0.5 or 1? | CFG-04 requires documented limits |
| Q-07 | Options UX: steppers only (as in the mockup), or also a numeric input with validation errors? Explicit **Save** button, or autosave? | UI-02 says "validation, saving" |
| Q-08 | Mobile orientation: landscape only (with a rotate prompt), or also portrait? | A11Y-03 |
| ~~Q-09~~ | *Decided in D-A/D-B/D-C: one hand-authored map as data, ≈24×14 tiles, always fully visible, authored spawn points.* Open only: the exact tile count and island layout. | GP-05 |
| Q-10 | Keyboard bindings (for example W/↑ forward, A/D or ←/→ rotate, Space front fire, Q/E broadside left/right, P/Esc pause)? | GP-06, GP-08 |
| Q-11 | Fire behavior: hold to keep firing at cooldown rate, or one shot per press? | GP-07 |
| Q-12 | Shooter weapon: front shot, broadside, or a simplified aimed shot? Does it need to align before firing? | EN-02 |
| Q-13 | Friendly fire: can enemy shots hit other enemies? Do enemies collide with each other? | CB-03 is silent |
| Q-14 | Ship-vs-ship contact (player vs. Shooter): block only, or damage too? | Only the Chaser impact is defined |
| Q-15 | Chaser explosion: damage only to the ship it hit, or area damage? | EN-01 |
| Q-16 | Maximum number of concurrent enemies? Chaser:Shooter ratio? Difficulty rising over time? | CFG-01 "spawn distribution" |
| Q-17 | Player health value (100 as in the mockup)? No regeneration? | GP-04 |
| Q-18 | Resume: a button only, or a button plus a 3-2-1 countdown? | MR-10 |
| Q-19 | Does Pause → Options exist (as in the mockup)? If so, it only affects the next match. | CFG-05 |
| Q-20 | Routing: real URLs (`/`, `/options`, `/play`, `/result`, `/log`) or in-memory screen state? Reloading `/play` → back to the menu. Reloading `/result` → shows the last saved result? | CFG-06, TEST-08, DEL-02 |
| Q-21 | Is audio in scope? Mute toggle saved locally? | Assets are provided, but it's not required |
| Q-22 | Where is the network-scenario selector: a hidden dev panel, a URL param only, or both? Visible in the production demo? | MSW-04, MSW-06 |
| Q-23 | How are pending records shown: a badge in the menu, a row style in Match History, only on the Result screen? | API-12 |
| Q-24 | Page size (5 as in the mockups)? History sorted newest first? | UI-05, UI-06 |
| Q-25 | Date/time format and locale ("08 SEP · 21:42")? | Mockups |
| Q-26 | Which ship color is the player (for example white or blue), and which colors do Chaser and Shooter use, so they're easy to tell apart? | FX-04, readability |

---

## 9. Deliverables I want from our sessions

| ID | Deliverable |
| --- | --- |
| D1 | **Layer and module diagram** with dependency rules (what may import what). |
| D2 | **Folder structure** proposal. |
| D3 | **State machines:** (a) app navigation/screens, (b) match lifecycle, (c) record submission (`draft → pending → submitting → confirmed`, with `failed → retry`). |
| D4 | **Sequence diagrams:** (a) app boot (MSW start → outbox flush → menu), (b) match start (options snapshot → asset load → sim init → loop), (c) match end → record → invalidation → tabs refresh, (d) timeout after save → retry → existing record returned, (e) out-of-order responses. |
| D5 | **Simulation loop** pseudo-code, including pause, a manual test clock, and the order of systems within one tick. |
| D6 | **Typed contracts:** `GameConfig`, `UserOptions`, `MatchConfig`, `MatchRecord`, `RankingEntry`, `Page<T>`, `ApiError`, `EndReason`, `Scenario`, the snapshot exposed to the HUD, the test snapshot. |
| D7 | **Collision and AI design notes** (shapes, resolution, avoidance, spawn-point selection). |
| D8 | **React ↔ Pixi bridge and HUD sync strategy**, including the Strict Mode–safe mount/unmount. |
| D9 | **Test strategy map:** each of TEST-01..18 → which hooks, scenarios, seeds, and viewports it needs. |
| D10 | **Wireframes for the missing states:** loading, asset error, empty, API error, pending record, result with record status, mobile landscape with touch controls, scenario selector. |
| D11 | **Milestone plan for two days** (§0.1), ordered by scoring weight and risk, with hour estimates and a **ranked cut list**: what goes first if I fall behind, and what can never go. The overall time estimate is also required by the challenge before I start. |
| D12 | **Risk register** (for example async Pixi init under Strict Mode, MSW in production, AI getting stuck on islands, flaky visual tests). |
| D13 | An outline for `ARCHITECTURE.md` matching DEL-04. |

---

## 10. Suggested session plan

1. **Understanding check:** summarize the challenge in 10 bullets, then ask me the §8 questions you consider blocking.
2. **Big picture:** D1, D2, D8.
3. **Game core:** D5, D7, config (§7.11), lifecycle (D3b).
4. **Assets and lifecycle:** §7.12, §7.13, the resize strategy.
5. **Data layer:** D6, D3c, D4, the MSW scenarios.
6. **Quality:** D9, the performance measurement plan.
7. **UI and accessibility:** D10.
8. **Planning:** D11, D12, D13.


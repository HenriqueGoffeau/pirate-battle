# Sources and licenses

This page lists every third-party resource in the repository and in the deployed build, as A11Y-01 and DEL-01
require: where it came from, what ships, and under which license.

## Game art (provided with the challenge)

The challenge supplied the art pack. It is kept as delivered in `assets/`, which is the conversion source only.
`assets/` is excluded from the Docker build context. `npm run convert-assets` (`scripts/convert-assets.ts`) turns
the files the game uses into the committed files under `public/` and `src/ui/sprites/`. Only those converted files
reach the build.

| Source in `assets/` | Shipped as | Origin | License |
| --- | --- | --- | --- |
| `spritesheet/ships_miscellaneous_sheet.png` + `.xml` | `public/assets/ships.png` + `ships.json` (the Sparrow XML converted to Pixi JSON; the image is unchanged) | Challenge pack; the art matches Kenney's Pirate Pack (see the note below) | CC0 1.0 (Kenney) |
| `png/default/ships/ship_2.png` | `src/ui/sprites/ship_player.png` (menu icon) | Same | CC0 1.0 (Kenney) |
| `tilesheet/tiles_sheet.png`, `tiles_sheet_retina.png` | `public/assets/tiles.png`, `tiles@2x.png` + JSON frame data generated from the 64 px grid | Same | CC0 1.0 (Kenney) |
| `spritesheet/ui_sheet.json`/`.png`, `ui_sheet_retina.json`/`.png` | `public/assets/ui_sheet*.{json,png}`, copied unchanged | "Pirate Battle UI asset pack" v1.0 (the atlas `meta.app`), made for the challenge | No license file in the pack; used as the challenge's visual base as instructed |
| `png/default/ui/{controls,hud,menu}/*.png` and the `png/retina/` twins | `src/ui/sprites/<name>.png` and `<name>@2x.png` (buttons, panel, HUD frames, icons) | Same UI pack | Same |
| `ui_scene_background.png` | `src/ui/sprites/scene_background.png` (behind every menu screen) | Provided by the challenge | Same |
| `logo_jungle_gaming.svg` | `src/ui/sprites/logo_jungle_gaming.svg` (menu footer) | Jungle Gaming logo, provided by the challenge | Not an open license. The mark belongs to Jungle Gaming and is shown only to identify the challenge |
| `sounds/*.wav` (27 files) | Not shipped | Provided by the challenge | Unused: the game has no audio, and no source file references them |
| `vector/*.svg`, `vector/*.swf`, the remaining `png/**`, `preview.png`, `sample*.png` | Not shipped | Provided by the challenge (source art and the mockups) | Kept for reference only |

**Note on the Kenney attribution.** The ships, ship parts, effects and the 64 px tile sheet match Kenney's
**Pirate Pack** (https://kenney.nl/assets/pirate-pack, "Creative Commons CC0"). The match covers the art itself, the
six colours × four damage stages of the ships, the tile sheet shipped without a data file, and the SVG/SWF vector
sources. The copy provided with the challenge renames the files and contains no `License.txt`. The attribution
therefore comes from comparing the files, not from a license file in the pack. CC0 requires no attribution; credit
is given anyway: ship and tile art by Kenney (www.kenney.nl).

## Own work

- The arena layout `scripts/maps/archipelago-1.txt` and the generated `public/maps/archipelago-1.json`, both
  written for this project.
- The pencil icon of the captain-name button, an inline SVG in `src/ui/components/RoundButton.module.css`. The pack
  has no pencil icon.
- All source code, tests, fixtures and documentation.

## Font

| | |
| --- | --- |
| Family | Nunito, variable (weight axis 200–1000), Latin subset |
| Files | `src/app/fonts/nunito-latin.woff2`, with the license text in `src/app/fonts/OFL.txt` |
| Source | Google Fonts, `https://fonts.gstatic.com/s/nunito/v32/XRXV3I6Li01BKofINeaB.woff2`, stored unmodified and self-hosted, so the build makes no request to Google |
| Copyright | Copyright 2014 The Nunito Project Authors (https://github.com/googlefonts/nunito) |
| License | SIL Open Font License, Version 1.1 |

## npm dependencies

These are the direct dependencies from `package.json`. The versions are the ones installed from `package-lock.json`,
and the licenses are read from each package's own `package.json`. Only the runtime dependencies end up in the
browser bundle.

**Runtime**

| Package | Version | License |
| --- | --- | --- |
| `react` | 19.3.0 | MIT |
| `react-dom` | 19.3.0 | MIT |
| `react-router` | 8.4.0 | MIT |
| `pixi.js` | 8.21.0 | MIT |
| `@tanstack/react-query` | 5.103.1 | MIT |
| `axios` | 1.20.0 | MIT |
| `msw` | 2.15.0 | MIT |

**Development and test**

| Package | Version | License |
| --- | --- | --- |
| `@eslint/js` | 10.0.1 | MIT |
| `@playwright/test` | 1.63.0 | Apache-2.0 |
| `@types/node` | 24.13.5 | MIT |
| `@types/react` | 19.3.0 | MIT |
| `@types/react-dom` | 19.3.0 | MIT |
| `@vitejs/plugin-react` | 6.1.1 | MIT |
| `eslint` | 10.10.0 | MIT |
| `eslint-import-resolver-typescript` | 4.4.5 | ISC |
| `eslint-plugin-boundaries` | 7.2.0 | MIT |
| `eslint-plugin-react-hooks` | 7.1.1 | MIT |
| `eslint-plugin-react-refresh` | 0.5.7 | MIT |
| `globals` | 17.12.0 | MIT |
| `typescript` | 6.0.3 | Apache-2.0 |
| `typescript-eslint` | 8.70.0 | MIT |
| `vite` | 8.3.0 | MIT |
| `vitest` | 5.0.1 | MIT |

Transitive dependencies are pinned in `package-lock.json`. Their licenses are in each package's `package.json` and
license file under `node_modules/` after `npm ci`.

## MSW service worker

`public/mockServiceWorker.js` is generated by `msw` 2.15.0 (the `msw.workerDirectory` field in `package.json`) and
is served unmodified. It is part of MSW: MIT License, Copyright (c) 2018–present Artem Zakharchenko.

## Container images (deploy and tests, not part of the bundle)

| Image | Used for | License |
| --- | --- | --- |
| `node:24-alpine` | Build stage of the `Dockerfile` | Node.js: MIT; Alpine packages under their own licenses |
| `nginx:1.30-alpine` | Serves the build in production | nginx: 2-clause BSD; Alpine packages under their own licenses |
| `mcr.microsoft.com/playwright:v1.63.0-noble` | `npm run test:e2e:docker` and CI | Playwright: Apache-2.0; Ubuntu packages and bundled browsers under their own licenses |

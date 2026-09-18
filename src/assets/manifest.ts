import type { AssetsManifest } from 'pixi.js'

export const combatBundle = 'combat'

export const mapIds = ['archipelago-1'] as const

export const mapAlias = (id: string) => `map:${id}`

export function createManifest(hiDpi: boolean): AssetsManifest {
  return {
    bundles: [
      {
        name: combatBundle,
        assets: [
          { alias: 'ships', src: '/assets/ships.json' },
          { alias: 'tiles', src: hiDpi ? '/assets/tiles@2x.json' : '/assets/tiles.json' },
          { alias: 'ui', src: hiDpi ? '/assets/ui_sheet_retina.json' : '/assets/ui_sheet.json' },
          ...mapIds.map((id) => ({ alias: mapAlias(id), src: `/maps/${id}.json` })),
        ],
      },
    ],
  }
}

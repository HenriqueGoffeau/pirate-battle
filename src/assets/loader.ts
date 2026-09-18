import { Assets, type Spritesheet } from 'pixi.js'
import { combatBundle, createManifest } from './manifest'

export type CombatAssets = { ships: Spritesheet; tiles: Spritesheet; ui: Spritesheet }

type ProgressListener = (progress: number) => void

const progressListeners = new Set<ProgressListener>()
let initialized: Promise<void> | null = null
let loading: Promise<CombatAssets> | null = null

async function load(): Promise<CombatAssets> {
  initialized ??= Assets.init({ manifest: createManifest(window.devicePixelRatio > 1.5) })
  await initialized
  const bundle = (await Assets.loadBundle(combatBundle, (progress) => {
    progressListeners.forEach((listener) => listener(progress))
  })) as CombatAssets
  return { ships: bundle.ships, tiles: bundle.tiles, ui: bundle.ui }
}

export function ensureLoaded(onProgress: ProgressListener): Promise<CombatAssets> {
  progressListeners.add(onProgress)
  loading ??= load().catch((error: unknown) => {
    loading = null
    throw error
  })
  return loading.finally(() => progressListeners.delete(onProgress))
}

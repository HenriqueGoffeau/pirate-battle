export type FireIntent = { front: boolean; left: boolean; right: boolean }

export type ShipIntent = { thrust: number; turn: number; fire: FireIntent }

export const idleIntent = (): ShipIntent => ({ thrust: 0, turn: 0, fire: { front: false, left: false, right: false } })

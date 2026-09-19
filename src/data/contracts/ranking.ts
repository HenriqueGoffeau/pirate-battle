type Rankable = { score: number; effectiveSec: number; playedAt: string; matchId: string }

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export function compareRanking(a: Rankable, b: Rankable): number {
  return (
    b.score - a.score ||
    a.effectiveSec - b.effectiveSec ||
    Date.parse(a.playedAt) - Date.parse(b.playedAt) ||
    compareText(a.matchId, b.matchId)
  )
}

import { useEffect, useRef, type RefObject } from 'react'
import type { HudSnapshot } from '../../session/store'

const gapMs = 1000
const timeMarks = [60, 30, 10]
const healthMarks = [0.5, 0.25]

function describeChange(previous: HudSnapshot, current: HudSnapshot): string[] {
  const messages: string[] = []
  if (current.matchState !== previous.matchState) {
    if (current.matchState === 'paused') messages.push('Paused.')
    if (current.matchState === 'running' && previous.matchState === 'resuming') messages.push('Resumed.')
    if (current.matchState === 'running' && previous.matchState === 'ready') {
      messages.push(`Battle started. ${current.timeLeftSec} seconds.`)
    }
    if (current.matchState === 'ended') {
      messages.push(`${current.endReason === 'defeated' ? 'Your ship was sunk' : "Time's up"}. Score ${current.score}.`)
    }
  }
  if (current.matchState !== 'running') return messages
  if (current.score > previous.score) messages.push(`Score ${current.score}.`)
  for (const mark of timeMarks) {
    if (previous.timeLeftSec > mark && current.timeLeftSec <= mark) messages.push(`${mark} seconds left.`)
  }
  const max = current.maxHealth || 1
  for (const mark of healthMarks) {
    if (previous.health / max > mark && current.health / max <= mark) messages.push(`Health below ${mark * 100} percent.`)
  }
  return messages
}

export function useMatchAnnouncer(hud: HudSnapshot): RefObject<HTMLDivElement | null> {
  const region = useRef<HTMLDivElement>(null)
  const previous = useRef<HudSnapshot | null>(null)
  const queue = useRef<string[]>([])
  const lastAt = useRef(Number.NEGATIVE_INFINITY)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    const before = previous.current
    previous.current = hud
    if (!before) return
    queue.current.push(...describeChange(before, hud))
    if (queue.current.length === 0 || timer.current !== null) return
    const flush = () => {
      timer.current = null
      const element = region.current
      if (!element || queue.current.length === 0) return
      const text = queue.current.join(' ')
      element.textContent = element.textContent === text ? `${text}\xa0` : text
      queue.current = []
      lastAt.current = performance.now()
    }
    const wait = lastAt.current + gapMs - performance.now()
    if (wait <= 0) flush()
    else timer.current = window.setTimeout(flush, wait)
  }, [hud])

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  return region
}

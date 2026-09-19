import { useImperativeHandle, useRef, type Ref } from 'react'
import type { HudSnapshot } from '../../session/store'
import { formatClock } from '../../shared/format'
import { RoundButton } from '../components/RoundButton'
import styles from './Hud.module.css'

export type HudHandle = { flash(): void }

type HudProps = { ref?: Ref<HudHandle>; hud: HudSnapshot; canPause: boolean; onPause(): void }

const frameWidth = 256
const fillLeft = 30
const fillWidth = 196
const flashFrames: Keyframe[] = [{ filter: 'brightness(1.8) drop-shadow(0 0 6px #f08a7a)' }, { filter: 'none' }]

function fillClass(ratio: number): string {
  if (ratio > 0.5) return styles.green
  if (ratio > 0.25) return styles.amber
  return styles.red
}

export function Hud({ ref, hud, canPause, onPause }: HudProps) {
  const barRef = useRef<HTMLSpanElement>(null)
  const ratio = hud.maxHealth > 0 ? Math.min(1, hud.health / hud.maxHealth) : 0
  const clipRight = ((frameWidth - fillLeft - fillWidth * ratio) / frameWidth) * 100

  useImperativeHandle(
    ref,
    () => ({
      flash() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
        barRef.current?.animate(flashFrames, { duration: 280, easing: 'ease-out' })
      },
    }),
    [],
  )

  return (
    <div className={styles.hud}>
      <div className={styles.stats}>
        <div
          className={styles.health}
          role="meter"
          aria-label="Health"
          aria-valuemin={0}
          aria-valuemax={hud.maxHealth}
          aria-valuenow={hud.health}
        >
          <span className={`${styles.icon} ${styles.heart}`} aria-hidden="true" />
          <span className={styles.bar} ref={barRef}>
            <span className={`${styles.fill} ${fillClass(ratio)}`} style={{ clipPath: `inset(0 ${clipRight}% 0 0)` }} />
            <span className={styles.healthText} aria-hidden="true">
              {hud.health} / {hud.maxHealth}
            </span>
          </span>
        </div>
        <div className={styles.counter}>
          <span className={`${styles.icon} ${styles.score}`} aria-hidden="true" />
          <output className={styles.value} aria-label="Score">
            {hud.score}
          </output>
        </div>
        <div className={styles.counter}>
          <span className={`${styles.icon} ${styles.time}`} aria-hidden="true" />
          <time className={styles.value} aria-label="Time left" dateTime={`PT${hud.timeLeftSec}S`}>
            {formatClock(hud.timeLeftSec)}
          </time>
        </div>
      </div>
      <RoundButton icon="pause" label="Pause" className={styles.pause} disabled={!canPause} onClick={onPause} />
    </div>
  )
}

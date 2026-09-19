import { useId } from 'react'
import { GoldButton } from '../components/GoldButton'
import { WoodPanel } from '../components/WoodPanel'
import styles from './LoadingPanel.module.css'

const frameWidth = 256
const fillLeft = 30
const fillWidth = 196

export function LoadingPanel({ progress }: { progress: number | null }) {
  const id = useId()
  const percent = Math.round((progress ?? 0) * 100)
  const clipRight = ((frameWidth - fillLeft - fillWidth * (percent / 100)) / frameWidth) * 100
  return (
    <div className={styles.screen}>
      <WoodPanel className={styles.panel}>
        <p id={id} className={styles.title}>
          Loading the fleet…
        </p>
        <div
          className={styles.bar}
          role="progressbar"
          aria-labelledby={id}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress === null ? undefined : percent}
        >
          <span className={styles.fill} style={{ clipPath: `inset(0 ${clipRight}% 0 0)` }} />
          <span className={styles.percent} aria-hidden="true">
            {percent}%
          </span>
        </div>
      </WoodPanel>
    </div>
  )
}

export function LoadErrorPanel({ onRetry, onMenu }: { onRetry(): void; onMenu(): void }) {
  return (
    <div className={styles.screen}>
      <WoodPanel className={styles.panel}>
        <div role="alert" className={styles.alert}>
          <p className={styles.title}>The fleet could not be loaded.</p>
          <p className={styles.text}>Check your connection and try again.</p>
        </div>
        <div className={styles.actions}>
          <GoldButton onClick={onRetry}>Retry</GoldButton>
          <GoldButton onClick={onMenu}>Main Menu</GoldButton>
        </div>
      </WoodPanel>
    </div>
  )
}

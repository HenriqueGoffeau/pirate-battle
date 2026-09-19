import styles from './RotateOverlay.module.css'

export function RotateOverlay() {
  return (
    <div className={styles.overlay} role="alert">
      <span className={styles.icon} aria-hidden="true" />
      <p className={styles.text}>Turn your device sideways to keep sailing.</p>
      <p className={styles.hint}>The battle is paused until you do.</p>
    </div>
  )
}

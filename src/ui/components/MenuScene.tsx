import type { ReactNode } from 'react'
import logoUrl from '../sprites/logo_jungle_gaming.svg'
import styles from './MenuScene.module.css'

export function MenuScene({ children }: { children: ReactNode }) {
  return (
    <div className={styles.scene}>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <span className={styles.build}>Build {import.meta.env.VITE_COMMIT_SHA ?? 'dev'}</span>
        <img className={styles.logo} src={logoUrl} alt="Jungle Gaming" />
      </footer>
    </div>
  )
}

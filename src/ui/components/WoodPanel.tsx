import type { HTMLAttributes } from 'react'
import styles from './WoodPanel.module.css'

export function WoodPanel({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={[styles.panel, className].filter(Boolean).join(' ')} {...rest} />
}

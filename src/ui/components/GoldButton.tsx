import type { ButtonHTMLAttributes } from 'react'
import styles from './GoldButton.module.css'

type GoldButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }

export function GoldButton({ variant = 'primary', className, type = 'button', ...rest }: GoldButtonProps) {
  return <button type={type} className={[styles.button, styles[variant], className].filter(Boolean).join(' ')} {...rest} />
}

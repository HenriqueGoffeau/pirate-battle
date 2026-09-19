import type { ComponentProps } from 'react'
import styles from './GoldButton.module.css'

type GoldButtonProps = ComponentProps<'button'> & { variant?: 'primary' | 'secondary' }

export function GoldButton({ variant = 'primary', className, type = 'button', ...rest }: GoldButtonProps) {
  return <button type={type} className={[styles.button, styles[variant], className].filter(Boolean).join(' ')} {...rest} />
}

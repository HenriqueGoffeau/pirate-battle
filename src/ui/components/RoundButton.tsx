import type { ButtonHTMLAttributes } from 'react'
import styles from './RoundButton.module.css'

export type RoundIcon = 'pause'

type RoundButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & {
  icon: RoundIcon
  label: string
}

export function RoundButton({ icon, label, className, type = 'button', ...rest }: RoundButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={[styles.button, styles[icon], className].filter(Boolean).join(' ')}
      {...rest}
    />
  )
}
